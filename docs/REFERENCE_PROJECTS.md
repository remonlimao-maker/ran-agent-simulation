# RAN Agent 开源项目参考

核实日期：2026-11-17。结论是：GitHub 上已经有若干相邻项目，但还没有成熟实现同时覆盖“网管大模型解析自然语言 → 结构化 Intent IR → 基站侧约 0.8B Pi Agent → 确定性 Function → 1 秒 ACK SLA”。

## 第一优先级：直接拆解

| 项目 | 与本项目的重合点 | 建议借鉴 | 不直接照搬的原因 |
| --- | --- | --- | --- |
| [AgentRAN](https://github.com/wineslab/agentran) | L2 Manager 拆解高层意图，Scheduler/Power/PRB Agent 读 KPM 并控制 OAI gNB | `subintents.json`、Agent 容器边界、KPM→决策→REST 控制链、OAI RFsim 环境 | 默认模型约 20B；当前没有正式 RIC；Power/PRB Agent 尚未进入默认 Compose；没有 0.8B/1 秒安全门槛 |
| [ORION](https://github.com/Centro-Innova/analysis-orion) | 自然语言经 LLM/MCP 转为 schema-compliant intent，再经 rApp/A1、xApp/E2 执行 | 让 LLM 只做语义翻译；CAMARA schema 校验；意图生命周期；资源 admission guard | 更偏完整 O-RAN 链路，模型和组件都比首版 MVP 重 |
| [Orange ib-ORAN](https://github.com/Orange-OpenSource/ns3-iboran) | ns-3 的 intent-based RAN 仿真，分离仿真与 Python 控制 App | Intent Satisfaction、Decision Time、批量 campaign、不同控制时域 | Intent 不是自然语言/LLM；若首版采用 CU/DU 直连，只应借指标与实验结构 |
| [Orange RIC-TaaP / ns-O-RAN-flexric](https://github.com/Orange-OpenSource/ns-O-RAN-flexric) | 5G-LENA + E2/FlexRIC，已有节能与 RF 重配置闭环以及可选 GUI | Cell on/off 动作、KPM/RC 映射、CU-CP/CU-UP/DU 分层日志、第二阶段对照环境 | 完整 O-RAN 栈较重；Web GUI 的 1 秒刷新不等于 Agent 的 1 秒 ACK |

## 第二优先级：轻量模型与安全闭环

| 项目 | 建议借鉴 | 主要限制 |
| --- | --- | --- |
| [TinyAgent](https://github.com/SqueezeAILab/TinyAgent) | 1.1B Function Calling、INT4、ToolRAG、领域数据微调方法 | 工具域是桌面应用，不是 RAN；需要重做基站 Function 数据与评测 |
| [BubbleRAN Telco Network Configuration](https://github.com/bubbleran/telco-network-configuration) | Monitoring→Configuration→Validation、失败回滚、KPI 历史/实时分离 | 默认 Llama 3.1 70B，不能作为轻量基站侧实现 |
| [BubbleRAN Auto-RAN](https://github.com/bubbleran/auto-ran) | twin-first 验证、monitor-plan-validate-enforce、安全执行 | 完整方案依赖更多平台组件，适合作为安全流程参考 |

## 第三优先级：真实 RAN 或协议后端

| 项目 | 适用阶段 | 建议定位 |
| --- | --- | --- |
| [Duranta OpenAirInterface](https://github.com/duranta-project/openairinterface5g) | 第二/三阶段 | RF simulator、真实 CU/DU、E2 Agent 和 KPM/RC adapter；模型应放 sidecar，不应嵌入实时线程 |
| [Duranta FlexRIC](https://github.com/duranta-project/flexric) | 第二阶段 | 轻量 near-RT RIC、E2 node emulator、xApp lifecycle 与 KPM→RC 闭环 |
| [srsRAN O-RAN SC RIC](https://github.com/srsran/oran-sc-ric) | 互操作验证 | 单机 Docker RIC、KPM monitoring 与 RC control xApp 示例 |
| [O-RAN SC](https://github.com/o-ran-sc) | 协议语义参考 | E2/RMR、订阅、控制 ACK、A1 policy 语义；不建议首版整体引入 |
| [srsRAN_Project](https://github.com/srsran/srsRAN_Project) | 只读历史参考 | CU/DU/E2 设计仍可学习，但仓库已于 2026-06-01 归档；新集成应面向其后继 OCUDU 或 Duranta |

## 建议吸收顺序

1. 保留当前 headless Pi runtime、单轮单工具 proposal 和确定性安全壳。
2. 先拆 AgentRAN 的意图分解/Agent 边界，再吸收 ORION 的 schema 与 admission 设计。
3. 把 ib-ORAN 的 Intent Satisfaction、Decision Time 和批量 campaign 加进现有实验矩阵。
4. 第二阶段通过 adapter 接 Orange ns-3 或 Duranta/OAI；Agent runtime 不重写。
5. 后期才接 OCUDU/真实 5GC/SDR，并把模型保持在 CU sidecar，避免侵入 DU 实时线程。

## 界面选择

仿真必须有可视界面，但不必把 Web 写进控制内核。推荐组合是：

- 浅色 Web/SSE：主实验控制台，负责发起、回放、拓扑、时间轴和 SLA 对比。
- CLI/JSONL：自动化、CI 和批量矩阵。
- Grafana/OpenTelemetry：长时间 KPI、资源与时延趋势。
- Tauri：需要桌面网管客户端时封装同一 Web UI。
- TUI：仅适合 SSH 调试，不作为主要演示界面。
