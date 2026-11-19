import { DuSimulator } from "./du-simulator.ts";
import { PiStationAgentAdapter } from "./pi-adapter.ts";
import { createLocalPiRunner } from "./pi-local.ts";
import { StationAgentRuntime } from "./runtime.ts";

const modelId = process.env.RAN_MODEL_ID ?? "qwen3:0.6b";
const runner = createLocalPiRunner({
  onEvent: (event) => process.stdout.write(`${JSON.stringify({ stream: "pi-agent", ...event })}\n`),
  onPayload: process.env.RAN_DEBUG_PROVIDER === "1"
    ? (payload) => { process.stdout.write(`${JSON.stringify({ stream: "provider-payload", payload })}\n`); }
    : undefined,
  onProviderStreamEvent: process.env.RAN_DEBUG_PROVIDER === "1"
    ? (data) => { process.stdout.write(`${JSON.stringify({ stream: "provider-event", data })}\n`); }
    : undefined,
});
const runtime = new StationAgentRuntime(
  new PiStationAgentAdapter(runner, modelId),
  new DuSimulator([{
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
  }], { ackDelayMs: 30 }),
);
runtime.subscribe((event) => process.stdout.write(`${JSON.stringify({ stream: "runtime", ...event })}\n`));

const now = Date.now();
const result = await runtime.run({
  schemaVersion: "0.1",
  intentId: `intent-local-${crypto.randomUUID()}`,
  issuedAt: new Date(now - 1_000).toISOString(),
  validUntil: new Date(now + 60_000).toISOString(),
  target: { gnbId: "gnb-001", cellIds: ["cell-01"] },
  objective: { metric: "energy_consumption", direction: "decrease", target: 0.15 },
  constraints: [
    { metric: "rrc_setup_success_rate", op: ">=", value: 0.99 },
    { metric: "dl_throughput_p95_mbps", op: ">=", value: 50 },
  ],
  allowedActions: ["set_energy_saving_mode"],
  execution: {
    controlDeadlineMs: 1_000,
    maxInferenceMs: 800,
    maxCells: 1,
    completionSemantics: "ACTION_ACK",
    timeoutPolicy: "SAFE_NOOP",
  },
});

process.stdout.write(`${JSON.stringify({ summary: result }, null, 2)}\n`);
if (result.status !== "succeeded") process.exitCode = 1;
