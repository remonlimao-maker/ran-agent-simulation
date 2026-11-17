import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";

import { DuSimulator } from "./du-simulator.ts";
import { PiStationAgentAdapter } from "./pi-adapter.ts";
import { PiAgentOneShotRunner } from "./pi-runner.ts";
import { StationAgentRuntime } from "./runtime.ts";

const faux = fauxProvider();
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([
  fauxAssistantMessage([
    fauxToolCall("set_energy_saving_mode", {
      cellId: "cell-01",
      mode: "LOW_POWER",
    }),
  ], { stopReason: "toolUse" }),
]);

const runner = new PiAgentOneShotRunner({
  model: faux.getModel(),
  streamFn: models.streamSimple.bind(models),
  onEvent: (event) => process.stdout.write(`${JSON.stringify({ stream: "pi-agent", ...event })}\n`),
});
const agent = new PiStationAgentAdapter(runner, "Qwen3.5-0.8B / faux transport");
const du = new DuSimulator([{
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
}], { ackDelayMs: 30 });
const runtime = new StationAgentRuntime(agent, du);
runtime.subscribe((event) => process.stdout.write(`${JSON.stringify({ stream: "runtime", ...event })}\n`));

const now = Date.now();
const result = await runtime.run({
  schemaVersion: "0.1",
  intentId: `intent-pi-${crypto.randomUUID()}`,
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
    maxInferenceMs: 450,
    maxCells: 1,
    completionSemantics: "ACTION_ACK",
    timeoutPolicy: "SAFE_NOOP",
  },
});

process.stdout.write(`${JSON.stringify({ summary: result }, null, 2)}\n`);
process.stdout.write("NOTE: Pi Agent Core and its event loop are real; the model response is a deterministic faux-provider fixture.\n");
