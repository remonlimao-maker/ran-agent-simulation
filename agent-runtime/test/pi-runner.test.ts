import assert from "node:assert/strict";
import test from "node:test";

import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";

import { DuSimulator } from "../src/du-simulator.ts";
import { PiStationAgentAdapter } from "../src/pi-adapter.ts";
import { PiAgentOneShotRunner, type PiAuditEvent } from "../src/pi-runner.ts";
import { StationAgentRuntime } from "../src/runtime.ts";
import type { CellSnapshot, StationIntent } from "../src/types.ts";

const FIXED_NOW = new Date("2026-11-17T02:00:00.000Z");

test("runs a real Pi one-shot tool loop while leaving actuation to the deterministic runtime", async () => {
  const audit: PiAuditEvent[] = [];
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([toolResponse()]);

  const runner = new PiAgentOneShotRunner({
    model: faux.getModel(),
    streamFn: models.streamSimple.bind(models),
    onEvent: (event) => audit.push(event),
  });
  const du = makeDu();
  const runtime = new StationAgentRuntime(
    new PiStationAgentAdapter(runner, "faux-0.8B"),
    du,
    { now: () => FIXED_NOW },
  );

  const result = await runtime.run(makeIntent());

  assert.equal(result.status, "succeeded");
  assert.equal(result.action?.actionName, "set_energy_saving_mode");
  assert.equal(du.getSnapshot("gnb-001", "cell-01").energySavingMode, "LOW_POWER");
  assert.equal(audit.some((event) => event.type === "tool_execution_start"), true);
  assert.equal(audit.some((event) => event.type === "tool_execution_end"), true);
  assert.equal(faux.state.callCount, 1, "terminate=true must prevent a second LLM call");
});

test("rejects a Pi response that attempts more than one proposal", async () => {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage([
      fauxToolCall("set_energy_saving_mode", proposalArguments()),
      fauxToolCall("set_energy_saving_mode", proposalArguments()),
    ], { stopReason: "toolUse" }),
  ]);
  const runner = new PiAgentOneShotRunner({
    model: faux.getModel(),
    streamFn: models.streamSimple.bind(models),
  });
  const du = makeDu();
  const runtime = new StationAgentRuntime(
    new PiStationAgentAdapter(runner, "faux-0.8B"),
    du,
    { now: () => FIXED_NOW },
  );

  const result = await runtime.run(makeIntent());

  assert.equal(result.status, "rejected");
  assert.match(result.reason ?? "", /exactly one tool call/);
  assert.equal(result.events.some((event) => event.type === "TOOL_DISPATCHED"), false);
  assert.equal(du.getSnapshot("gnb-001", "cell-01").configVersion, 7);
});

function toolResponse() {
  return fauxAssistantMessage([
    fauxToolCall("set_energy_saving_mode", proposalArguments()),
  ], { stopReason: "toolUse" });
}

function proposalArguments() {
  return {
    cellId: "cell-01",
    mode: "LOW_POWER",
  };
}

function makeDu(): DuSimulator {
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
  return new DuSimulator([cell], { ackDelayMs: 1 });
}

function makeIntent(): StationIntent {
  return {
    schemaVersion: "0.1",
    intentId: "intent-pi-test-001",
    issuedAt: "2026-11-17T01:59:00.000Z",
    validUntil: "2026-11-17T02:04:00.000Z",
    target: { gnbId: "gnb-001", cellIds: ["cell-01"] },
    objective: { metric: "energy_consumption", direction: "decrease", target: 0.15 },
    constraints: [{ metric: "rrc_setup_success_rate", op: ">=", value: 0.99 }],
    allowedActions: ["set_energy_saving_mode"],
    execution: {
      controlDeadlineMs: 1_000,
      maxInferenceMs: 450,
      maxCells: 1,
      completionSemantics: "ACTION_ACK",
      timeoutPolicy: "SAFE_NOOP",
    },
  };
}
