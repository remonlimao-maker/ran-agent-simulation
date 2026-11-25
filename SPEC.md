# RAN Agent Simulation 技术规范

| 状态 | 契约版本 | 适用范围 |
| --- | --- | --- |
| v0.1 开发基线 | Intent IR / Runtime Event `0.1` | 本地仿真、双模型联调与硬件容量实验 |

本文中大写 `MUST` 和 `MUST NOT` 表示规范性要求，按 [BCP 14](https://www.rfc-editor.org/info/bcp14) 解释。

## 1. 目标与范围

验证网管大模型能否把客户意图转成正确的结构化契约，以及约 0.8B 的基站小模型能否通过 Pi Agent 生成正确的单次工具调用，在 `1,000 ms` 内取得模拟 Function ACK。允许用不同的实验时限定位性能边界。当前参考模型为 Ollama `qwen3:0.6b`。

v0.1 的执行环境是 Station Function 模拟器。真实网络写入、生产鉴权、跨重启防重放、ACK 后 KPI 验证与回滚属于后续范围。架构与消息交互见 [分层架构](docs/diagrams/architecture.puml) 和 [控制时序](docs/diagrams/control-sequence.puml)。

## 2. 角色与接口

| 组件 | 输入 → 输出 | 责任 |
| --- | --- | --- |
| 网管 Intent Agent | 自然语言 → [Intent IR](agent-runtime/contracts/intent.schema.json) | `INT-01` MUST 解析目标、指标、约束、动作范围和时限。远端模型路径只接受一次 `emit_intent_semantics` 调用。应用组装身份标识、有效期与执行策略，规范化已知指标别名并校验 IR 后才交给基站。 |
| 基站 Pi Agent | Intent IR、遥测快照、允许的工具 → [Action Proposal](agent-runtime/contracts/action.schema.json) | `CTL-01` MUST 限制为单轮、单提案。Pi 工具回调只记录提案，MUST NOT 写入小区状态。提案包含动作、单一目标小区、参数和 `expectedConfigVersion`。 |
| 确定性 Runtime 与 Function | Intent IR、提案 → ACK 或失败终态 | `CTL-02` MUST 在推理前检查范围、有效期、同一 Runtime 实例中的重放及每个目标小区的遥测约束。缺失数值或约束不满足时拒绝。分派前 MUST 校验白名单、目标、参数与剩余预算，并拒绝重复写入当前值或违背已定义目标方向的提案。Function 在提交前复查取消、时限与配置版本。 |
| 观测控制台 | [Runtime Event](agent-runtime/contracts/event.schema.json)、Pi 事件、资源样本 → 可视化 | `OBS-01` MUST 显示结构化意图、Tool Call、Function ACK 或停止原因。Runtime 事件按任务内 `sequence` 排序。观察器异常 MUST NOT 中断控制。展示延时 MUST NOT 计入控制时延。 |

网管契约当前使用 `energy_consumption`、`dl_throughput_p95_mbps` 和 `rrc_setup_success_rate`。百分数采用比例值（`99%` 写成 `0.99`），吞吐采用 Mbps。约束运算符为 `>=`、`<=`、`==`。运行时支持三个动作，工具集合由 `allowedActions` 限定。

| 动作 | 参数 |
| --- | --- |
| `set_energy_saving_mode` | `mode` 为 `ACTIVE` 或 `LOW_POWER`。降低能耗目标使用 `LOW_POWER`，提高能耗目标使用 `ACTIVE`。 |
| `set_tx_power_offset` | `offsetDb` 在 `[-3, 3]` dB 内 |
| `set_scheduler_profile` | `profile` 为 `balanced`、`latency` 或 `throughput` |

本地联调接口默认位于 `127.0.0.1:4175`。

| 接口 | 契约 |
| --- | --- |
| `POST /api/run` | 提交 `naturalLanguage`、基站 `mode`（`rules` / `pi-faux` / `pi-api`）、`scenario`（`success` / `model_timeout` / `du_timeout`）。可选字段为 `intentMode`（`synthetic` / `intent-api`）和 `demoPaceMs`。接收成功返回 `202` 与 `runId`。 |
| `GET /api/events`、`GET /api/health` | 前者以 SSE 推送阶段、资源样本和终态，后者返回服务运行状态。 |
| `GET/POST /api/model-config` | 读取或应用 `intent`、`station` 两路独立配置。界面提交的 Key 保留在服务进程内存中。读取配置时，凭据仅返回 `apiKeyConfigured` 标志。 |

## 3. 时限、状态与安全语义

- `CTL-03` **计时**。`T_intent` 在网管侧独立记录。`T_ack` 自基站 Runtime 接收 IR 起，到 Function ACK 止，覆盖校验、快照、决策、分派和模拟执行。总时限范围为 `50–10,000 ms`，推理预算必须小于总时限并保留执行余量。实时入口的标准 `1,000 ms` 档分配 `800 ms` 给推理，`5,000 ms` 对照档分配 `4,800 ms`。批量实验显式记录实际使用的两项预算。
- **`succeeded` / `ACTION_ACK`**。Function 应答包含 `applied` 和 `configVersion`。正常应用时状态写入一次并递增版本。`dryRun` 返回 `applied: false`，配置保持原值。按时完成由 `slaMet` 独立判定，业务 KPI 达成另用 `T_effect` 验证。
- **`safe_timeout` / `SAFE_NOOP`**。推理超时 MUST 取消决策并丢弃迟到提案。模拟 Function 在提交前超时 MUST 保持原状态。
- **`rejected` / `REJECTED`**。校验或执行错误返回可定位的原因。前置校验失败时跳过模型。动作校验失败时禁止分派。配置版本冲突时禁止提交。网管解析失败走 `run_error`，基站控制阶段未开始。

## 4. 实验与测量

- `OBS-02` **指标来源**。真实模型耗时、Token、Agent 进程 CPU/RSS、Ollama 驻留内存和 Mac 系统级 GPU 采样按各自来源报告。缺失数据标为 `N/A`。等效 TOPS/权重带宽标为吞吐推导值，芯片容量表标为设计估算。系统级 GPU 样本只描述本机总体利用率。远端 API 的服务端硬件指标填 `N/A`。
- `EXP-01` **可比性**。规则、Pi faux、Pi 加真实模型 MUST 分开报告。Pi faux 使用真实框架及预置模型响应。同一组硬件对比 MUST 固定任务集、模型文件与量化、运行时、提示词、工具 Schema、并发和时限。记录样本数，按实际模型驻留状态分报冷启动和预热。现有批量工具的精度与冷/热标签需由实验者在外部验证。
- **研究门槛**。分别评估网管字段正确率和基站工具及参数完全匹配率。按时安全完成要求动作正确、无违规且在时限内取得 ACK，分母为全部任务。1 秒档报告预热、`batch=1` 的 P50/P95/P99 `T_ack`，同时列出 ACK 样本数、总样本数和超时率。首轮筛选目标为误执行率 `0`、Schema 有效率 `≥99.5%`、正常单步工具及参数正确率 `≥98%`、P95 `T_ack ≤1,000 ms`。通过门槛的候选硬件再比较实测内存占用、能耗和成本。完整方案见 [实验计划](docs/EXPERIMENT_PLAN.md)。

## 5. 验收与变更规则

| 场景 | 可验证结果 |
| --- | --- |
| `INT-01` 合法节能意图 | `gnb-001/cell-01`、节能 `15%` 与下行 P95 `≥50 Mbps` 映射为正确字段，可追溯指标名归一化。 |
| `CTL-01/02` 正常执行 | 单一有效 `LOW_POWER` 提案通过校验，模拟 Function 返回 `ACTION_ACK`，且 `applied: true`、配置版本递增一次。 |
| `CTL-02/03` 故障路径 | 过期、遥测缺失或约束不满足时跳过推理。越权或多提案拒绝执行。推理超时和模拟 Function 提交前超时进入 `SAFE_NOOP`，小区状态保持原值。 |
| `OBS-01/02`、`EXP-01` 观测与复现 | 从一次运行定位终止阶段，核对提案、ACK 或错误及各指标来源。批量结果可按条件复算。真实基站性能需在受控硬件上独立验收。 |

在 `agent-runtime/` 运行 `npm ci` 与 `npm test` 验证自动化基线，使用 `npm run live` 核对界面和真实本地模型路径，使用 `npm run experiment -- --help` 查看实验入口。改变字段、执行语义或终态的变更 MUST 同步规范、对应 Schema 与测试。不兼容的版本化契约变更 MUST 更新版本并说明迁移方式。
