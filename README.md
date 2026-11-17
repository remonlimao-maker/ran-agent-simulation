# RAN Agent Simulation

一个面向 RAN 智能控制的轻量化 Agent 实验项目，用于探索约 0.8B 参数的小模型在严格安全约束下，能否在 1 秒内完成意图理解、工具选择和任务确认。

## 工作原理

1. 网管 Agent 将运营商的自然语言需求转换为结构化 Intent IR。
2. 基站侧轻量 Agent 结合实时状态，由小模型生成受约束的工具调用建议。
3. 确定性安全层校验权限、参数、时限、状态版本和冲突条件。
4. Function Adapter 调用模拟网络功能并返回 ACK。
5. 系统持续观察 KPI；效果不满足目标时进入安全降级或回滚流程。

模型只负责语义理解和工具建议，最终执行权始终由确定性逻辑控制。

## 架构

```text
自然语言意图
      │
      ▼
网管 Intent Agent
      │  Intent IR
      ▼
基站侧 Lightweight Pi Agent
      ├── 约 0.8B 模型：生成单次工具建议
      ├── Guardrail：校验、限时、冲突处理
      └── Function Adapter：执行模拟网络功能
                          │
                          ▼
                  ACK / KPI / 回滚
                          │
                          └── Event Stream ──► 可视化控制台
```

核心契约分为 Intent、Action 和 Event 三层。Agent Runtime、执行适配器与观察界面彼此解耦，不绑定特定的无线接入实现。

## 核心特征

- **轻量化**：以约 0.8B 模型和 Pi Agent 为主要实验对象。
- **低时延**：区分任务 ACK 时延与 KPI 生效时间，目标 ACK 不超过 1 秒。
- **安全执行**：限制单次工具调用，并提供超时、拒绝、幂等和回滚路径。
- **可观测**：展示意图转换、Agent 事件、工具调用、延迟预算和执行结果。
- **可替换**：模型、Function Adapter、界面和实验条件均可独立替换。
- **可对比**：支持规则基线、量化方式、冷热启动、工具数量和 SLA 档位实验。

## 快速开始

```bash
cd agent-runtime
npm ci
npm test
npm run live
```

打开 `http://127.0.0.1:4175` 查看实时任务过程。

启动实验仪表盘：

```bash
cd ran-agent-dashboard
npm ci
npm run dev
```

## 实验与文档

- [Agent Runtime](agent-runtime/README.md)
- [实验设计](docs/EXPERIMENT_PLAN.md)
- [开源项目参考](docs/REFERENCE_PROJECTS.md)

当前版本使用合成任务和模拟网络功能，适合验证架构、安全策略、模型能力与资源需求，不代表生产网络性能。

## License

本项目采用 [MIT License](LICENSE)。
