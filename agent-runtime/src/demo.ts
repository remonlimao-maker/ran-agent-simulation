import { DuSimulator } from "./du-simulator.ts";
import { RuleBasedAgent } from "./rule-agent.ts";
import { StationAgentRuntime } from "./runtime.ts";
import type { CellSnapshot, StationIntent } from "./types.ts";

const cell: CellSnapshot = {
  gnbId: "gnb-001",
  cellId: "cell-01",
  configVersion: 7,
  energySavingMode: "ACTIVE",
  txPowerOffsetDb: 0,
  schedulerProfile: "balanced",
  metrics: {
    energy_consumption: 100,
    rrc_setup_success_rate: 0.998,
    dl_throughput_p95_mbps: 82,
  },
};

const now = new Date();
const intent: StationIntent = {
  schemaVersion: "0.1",
  intentId: `intent-${crypto.randomUUID()}`,
  issuedAt: now.toISOString(),
  validUntil: new Date(now.getTime() + 60_000).toISOString(),
  target: { gnbId: "gnb-001", cellIds: ["cell-01"] },
  objective: { metric: "energy_consumption", direction: "decrease", target: 0.15 },
  constraints: [
    { metric: "rrc_setup_success_rate", op: ">=", value: 0.99 },
    { metric: "dl_throughput_p95_mbps", op: ">=", value: 50 },
  ],
  allowedActions: ["set_energy_saving_mode"],
  execution: {
    controlDeadlineMs: 1_000,
    maxInferenceMs: 450,
    maxCells: 1,
    completionSemantics: "ACTION_ACK",
    timeoutPolicy: "SAFE_NOOP",
  },
};

const runtime = new StationAgentRuntime(
  new RuleBasedAgent(),
  new DuSimulator([cell], { ackDelayMs: 30 }),
);

runtime.subscribe((event) => console.log(JSON.stringify(event)));
const result = await runtime.run(intent);
console.log(JSON.stringify({ summary: result }, null, 2));
