import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { DuSimulator } from "../src/du-simulator.ts";
import { RuleBasedAgent } from "../src/rule-agent.ts";
import { StationAgentRuntime } from "../src/runtime.ts";
import type {
  ActionProposal,
  CellSnapshot,
  DecisionContext,
  DecisionInput,
  StationDecisionAgent,
  StationIntent,
} from "../src/types.ts";

const FIXED_NOW = new Date("2026-11-17T02:00:00.000Z");

test("completes a bounded action with ACK inside the control SLA", async () => {
  const du = makeDu();
  const runtime = new StationAgentRuntime(new RuleBasedAgent(), du, { now: () => FIXED_NOW });

  const result = await runtime.run(makeIntent());

  assert.equal(result.status, "succeeded");
  assert.equal(result.slaMet, true);
  assert.equal(result.ack?.applied, true);
  assert.equal(du.getSnapshot("gnb-001", "cell-01").energySavingMode, "LOW_POWER");
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "INTENT_RECEIVED",
      "SCHEMA_VALIDATED",
      "SNAPSHOT_CAPTURED",
      "MODEL_STARTED",
      "MODEL_COMPLETED",
      "PLAN_VALIDATED",
      "TOOL_DISPATCHED",
      "ACTION_ACK",
    ],
  );
});

test("turns a late model result into SAFE_NOOP and never actuates", async () => {
  const du = makeDu();
  const runtime = new StationAgentRuntime(new SlowAgent(35), du, { now: () => FIXED_NOW });
  const intent = makeIntent({ controlDeadlineMs: 80, maxInferenceMs: 8 });

  const result = await runtime.run(intent);

  assert.equal(result.status, "safe_timeout");
  assert.equal(result.events.at(-1)?.type, "SAFE_NOOP");
  assert.equal(result.events.at(-1)?.detail.lateResultsDiscarded, true);
  assert.equal(du.getSnapshot("gnb-001", "cell-01").configVersion, 7);
});

test("enforces the inference deadline even when the model blocks the event loop", async () => {
  const du = makeDu();
  const runtime = new StationAgentRuntime(new BlockingAgent(25), du, { now: () => FIXED_NOW });
  const intent = makeIntent({ controlDeadlineMs: 80, maxInferenceMs: 5 });

  const result = await runtime.run(intent);

  assert.equal(result.status, "safe_timeout");
  assert.equal(result.events.at(-1)?.type, "SAFE_NOOP");
  assert.equal(result.events.at(-1)?.detail.phase, "inference");
  assert.equal(du.getSnapshot("gnb-001", "cell-01").configVersion, 7);
});

test("rejects an out-of-scope target before dispatch", async () => {
  const du = makeDu();
  const runtime = new StationAgentRuntime(new FixedAgent({
    actionName: "set_energy_saving_mode",
    target: { gnbId: "gnb-001", cellId: "cell-99" },
    parameters: { mode: "LOW_POWER" },
    expectedConfigVersion: 7,
  }), du, { now: () => FIXED_NOW });

  const result = await runtime.run(makeIntent());

  assert.equal(result.status, "rejected");
  assert.match(result.reason ?? "", /outside the signed intent scope/);
  assert.equal(result.events.at(-1)?.detail.code, "TARGET_OUT_OF_SCOPE");
  assert.equal(result.events.some((event) => event.type === "TOOL_DISPATCHED"), false);
});

test("rejects a model proposal that repeats the current value", async () => {
  const du = makeDu();
  const runtime = new StationAgentRuntime(new FixedAgent({
    actionName: "set_energy_saving_mode",
    target: { gnbId: "gnb-001", cellId: "cell-01" },
    parameters: { mode: "ACTIVE" },
    expectedConfigVersion: 7,
  }), du, { now: () => FIXED_NOW });

  const result = await runtime.run(makeIntent());

  assert.equal(result.status, "rejected");
  assert.equal(result.events.at(-1)?.detail.code, "NO_EFFECT_ACTION");
  assert.equal(result.events.some((event) => event.type === "TOOL_DISPATCHED"), false);
  assert.equal(du.getSnapshot("gnb-001", "cell-01").configVersion, 7);
});

test("rejects an expired intent before model invocation", async () => {
  const du = makeDu();
  const agent = new CountingAgent();
  const runtime = new StationAgentRuntime(agent, du, { now: () => FIXED_NOW });
  const intent = makeIntent();
  intent.validUntil = "2026-11-17T01:59:59.000Z";

  const result = await runtime.run(intent);

  assert.equal(result.status, "rejected");
  assert.equal(result.events.at(-1)?.detail.code, "STALE_INTENT");
  assert.equal(agent.calls, 0);
});

test("rejects an intent issued too far in the future", async () => {
  const du = makeDu();
  const agent = new CountingAgent();
  const runtime = new StationAgentRuntime(agent, du, { now: () => FIXED_NOW });
  const intent = makeIntent();
  intent.issuedAt = "2026-11-17T02:01:00.000Z";
  intent.validUntil = "2026-11-17T02:02:00.000Z";

  const result = await runtime.run(intent);

  assert.equal(result.status, "rejected");
  assert.equal(result.events.at(-1)?.detail.code, "FUTURE_INTENT");
  assert.equal(agent.calls, 0);
});

test("rejects a breached telemetry constraint before model invocation", async () => {
  const du = makeDu();
  const agent = new CountingAgent();
  const runtime = new StationAgentRuntime(agent, du, { now: () => FIXED_NOW });
  const intent = makeIntent();
  intent.constraints[0].value = 0.999;

  const result = await runtime.run(intent);

  assert.equal(result.status, "rejected");
  assert.equal(result.events.at(-1)?.detail.code, "CONSTRAINT_VIOLATION");
  assert.equal(agent.calls, 0);
  assert.equal(du.getSnapshot("gnb-001", "cell-01").configVersion, 7);
});

test("claims each intent id once to block in-process replay", async () => {
  const du = makeDu();
  const runtime = new StationAgentRuntime(new RuleBasedAgent(), du, { now: () => FIXED_NOW });
  const intent = makeIntent();

  const first = await runtime.run(intent);
  const replay = await runtime.run(intent);

  assert.equal(first.status, "succeeded");
  assert.equal(replay.status, "rejected");
  assert.equal(replay.events.at(-1)?.detail.code, "REPLAYED_INTENT");
  assert.equal(du.getSnapshot("gnb-001", "cell-01").configVersion, 8);
});

test("cancels a DU action that cannot ACK before the deadline", async () => {
  const du = makeDu(100);
  const runtime = new StationAgentRuntime(new RuleBasedAgent(), du, { now: () => FIXED_NOW });
  const intent = makeIntent({ controlDeadlineMs: 50, maxInferenceMs: 15 });

  const result = await runtime.run(intent);

  assert.equal(result.status, "safe_timeout");
  assert.equal(result.events.at(-1)?.type, "SAFE_NOOP");
  assert.equal(du.getSnapshot("gnb-001", "cell-01").configVersion, 7);
  assert.equal(du.getSnapshot("gnb-001", "cell-01").energySavingMode, "ACTIVE");
});

test("emits ordered, JSON-serializable events for the visual console", async () => {
  const du = makeDu();
  const observed: unknown[] = [];
  const runtime = new StationAgentRuntime(new RuleBasedAgent(), du, { now: () => FIXED_NOW });
  runtime.subscribe((event) => observed.push(event));

  const result = await runtime.run(makeIntent());
  const decoded = JSON.parse(JSON.stringify(observed));

  assert.equal(decoded.length, result.events.length);
  assert.deepEqual(decoded.map((event: { sequence: number }) => event.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("isolates throwing and mutating observers from the control transaction", async () => {
  const du = makeDu();
  const runtime = new StationAgentRuntime(new RuleBasedAgent(), du, { now: () => FIXED_NOW });
  runtime.subscribe((event) => {
    assert.throws(() => {
      (event.detail as Record<string, unknown>).tampered = true;
    }, TypeError);
    if (event.type === "ACTION_ACK") throw new Error("broken visual console");
  });

  const result = await runtime.run(makeIntent());

  assert.equal(result.status, "succeeded");
  assert.equal(result.events.some((event) => "tampered" in event.detail), false);
  assert.equal(du.getSnapshot("gnb-001", "cell-01").energySavingMode, "LOW_POWER");
});

function makeDu(ackDelayMs = 1): DuSimulator {
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
  return new DuSimulator([cell], { ackDelayMs });
}

function makeIntent(
  budget: Partial<StationIntent["execution"]> = {},
): StationIntent {
  return {
    schemaVersion: "0.1",
    intentId: "intent-test-001",
    issuedAt: "2026-11-17T01:59:00.000Z",
    validUntil: "2026-11-17T02:04:00.000Z",
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
      ...budget,
    },
  };
}

class SlowAgent implements StationDecisionAgent {
  readonly name = "slow-agent";
  readonly model = "simulated-0.8B";
  readonly #latencyMs: number;

  constructor(latencyMs: number) {
    this.#latencyMs = latencyMs;
  }

  async decide(input: DecisionInput, _context: DecisionContext): Promise<ActionProposal> {
    await delay(this.#latencyMs);
    const snapshot = input.snapshots[0];
    return {
      actionName: "set_energy_saving_mode",
      target: { gnbId: snapshot.gnbId, cellId: snapshot.cellId },
      parameters: { mode: "LOW_POWER" },
      expectedConfigVersion: snapshot.configVersion,
    };
  }
}

class BlockingAgent implements StationDecisionAgent {
  readonly name = "blocking-agent";
  readonly model = "event-loop-blocking-fixture";
  readonly #latencyMs: number;

  constructor(latencyMs: number) {
    this.#latencyMs = latencyMs;
  }

  async decide(input: DecisionInput, _context: DecisionContext): Promise<ActionProposal> {
    const stopAt = performance.now() + this.#latencyMs;
    while (performance.now() < stopAt) {
      // Deliberately block to prove that setTimeout alone is not a deadline.
    }
    const snapshot = input.snapshots[0];
    return {
      actionName: "set_energy_saving_mode",
      target: { gnbId: snapshot.gnbId, cellId: snapshot.cellId },
      parameters: { mode: "LOW_POWER" },
      expectedConfigVersion: snapshot.configVersion,
    };
  }
}

class FixedAgent implements StationDecisionAgent {
  readonly name = "fixed-agent";
  readonly #proposal: ActionProposal;

  constructor(proposal: ActionProposal) {
    this.#proposal = proposal;
  }

  async decide(_input: DecisionInput, _context: DecisionContext): Promise<ActionProposal> {
    return structuredClone(this.#proposal);
  }
}

class CountingAgent implements StationDecisionAgent {
  readonly name = "counting-agent";
  calls = 0;

  async decide(input: DecisionInput, _context: DecisionContext): Promise<ActionProposal> {
    this.calls += 1;
    const snapshot = input.snapshots[0];
    return {
      actionName: "set_energy_saving_mode",
      target: { gnbId: snapshot.gnbId, cellId: snapshot.cellId },
      parameters: { mode: "LOW_POWER" },
      expectedConfigVersion: snapshot.configVersion,
    };
  }
}
