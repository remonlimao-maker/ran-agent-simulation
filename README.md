# RAN Agent Simulation

这是一个面向前期探索的 CU/DU RAN Agent 原型，重点回答：在严格意图契约和确定性安全壳内，约 0.8B 的模型与轻量 Agent 框架能否在 1 秒内安全完成一次基站控制任务。

## 当前架构

```text
运营商自然语言
  -> 网管 Intent Agent（大模型，暂不在本仓库实现）
  -> 结构化 Intent IR（部署桥接层应验证签名）
  -> CU 侧 Pi Agent Core + 0.8B 本地模型
       仅做一次受约束 tool proposal
  -> 确定性 guardrail
  -> CU/DU Function adapter
  -> ACTION_ACK
  -> 独立的 KPI 效果观察与必要时回滚
```

首版直接使用 3GPP CU/DU 思路，不依赖完整 O-RAN SMO/RIC。后续可在不改变 Intent / Action / Event 契约的前提下增加 E2/O1 adapter。

## 1 秒的定义

- `T_ack`：收到结构化意图到 CU/DU Function ACK，硬目标为 1,000 ms。
- `T_effect`：动作后 KPI 是否满足目标，使用更长的观察窗口，不计入 1 秒 ACK。
- 推理有独立的 `maxInferenceMs`；超时后撤销执行资格并进入 `SAFE_NOOP`。
- 模型晚到结果会被丢弃，不能调用 DU Function。

参考预算：校验与能力检查 60 ms、遥测快照 80–100 ms、0.8B 推理 450 ms、确定性 guardrail 75–100 ms、Function dispatch/ACK 160–190 ms，保留约 100 ms 余量。

## 运行时

```bash
cd agent-runtime
npm ci
npm test
npm run demo:pi
npm run bench:pi
```

连接本地 llama.cpp、vLLM、Ollama 或 LM Studio：

```bash
RAN_MODEL_BASE_URL=http://127.0.0.1:8000/v1 \
RAN_MODEL_ID=Qwen/Qwen3.5-0.8B \
npm run demo:local
```

详细说明见 `agent-runtime/README.md`。

完整的假设、因子矩阵、指标定义和首轮门槛见 `docs/EXPERIMENT_PLAN.md`。

实时查看一轮 Pi/Runtime 事件：

```bash
cd agent-runtime
npm run live
# 浏览器打开 http://127.0.0.1:4175
```

该服务只绑定 loopback，且只连接本地模拟器。

## 可视化控制台

界面是必需的观察与实验入口，但 Web 不是仿真内核的依赖。当前采用浅色 Web/SSE 控制台，是因为它最容易同时呈现实时拓扑、Agent 事件流、1 秒预算条和实验对比；同一 headless runtime 也可由 CLI/JSONL、TUI 或 Grafana 消费。若后续需要独立网管客户端，可用 Tauri 封装现有界面，而无需改动 Pi Agent、Intent IR 或 CU/DU Function adapter。

控制台包含 task-042 的 785 ms synthetic replay、Pi Agent 事件流、CU/DU 拓扑、1 秒预算条、SLA/模型/量化/冷热启动筛选、KPI 效果观察和实验运行矩阵。当前所有面板数据都明确标记为 synthetic fixture，不代表真实 0.8B 或无线网络测量。

构建或启动开发预览：

```bash
cd ran-agent-dashboard
npm ci
npm run build
npm run dev
```

构建产物位于 `ran-agent-dashboard/dist/`，不会提交到仓库。

## 最小实验矩阵

1. 规则/状态机基线与 Pi + 0.8B 对比。
2. INT4 与 INT8；warm 与 cold start。
3. 250 / 500 / 1,000 / 3,000 ms SLA profile。
4. 5 / 8 / 20 个候选工具，256 / 512 输入 token，最多 32 输出 token。
5. 正常意图、缺字段、过期、冲突、多工具、陈旧遥测、DU ACK 丢失与配置版本冲突。

主指标是 Safe Task Completion、False Actuation、P50/P95 ACK latency、峰值 RSS/VRAM、能耗和回滚成功率。规则基线必须始终保留；如果 0.8B 不能在安全完成率上超过规则，就不应引入模型。

## 开源参考

已核实的相似项目、可复用模块和差距见 [`docs/REFERENCE_PROJECTS.md`](docs/REFERENCE_PROJECTS.md)。其中 AgentRAN 最接近多 Agent RAN 控制，ORION 最接近自然语言到结构化意图链路，Orange ib-ORAN 最适合借实验指标，Duranta/OAI 或 OCUDU 适合作为后期真实 CU/DU 后端。

## 当前验证范围

- 确定性运行时、Pi Agent Core、实验矩阵与实时控制台测试：20/20 通过。
- Pi 工具回调只记录 proposal，不直接执行基站动作。
- 多工具响应会在 dispatch 前拒绝。
- 超时与迟到结果不会改变 DU 配置。
- 同步阻塞超过推理预算也会被二次单调时钟检查拦截。
- UI/SSE 观察器抛错或篡改事件不会改变控制事务结果。
- 当前遥测违反约束、未来意图和进程内重复 intent ID 会在模型/dispatch 前拒绝。
- 框架 faux-provider 基准仅测 Agent/event/tool loop，不包含真实模型加载或推理。
- 控制台通过 1280 px 和 390 px 视觉检查。

当前仍是实验模拟器：签名验证与跨重启持久化防重放尚未实现，真实部署时必须由 NMS/CU 接入层补齐。
