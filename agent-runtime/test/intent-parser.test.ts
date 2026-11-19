import assert from "node:assert/strict";
import test from "node:test";

import {
  IntentParseError,
  parseNaturalLanguageIntent,
} from "../src/intent-parser.ts";

const FIXED_NOW = new Date("2026-11-17T06:00:00.000Z");
const SAMPLE = "请将 gnb-001 的 cell-01 设为低功耗模式，目标降低能耗 15%，但下行 P95 吞吐不得低于 50 Mbps，RRC 成功率不得低于 99%，并在 1 秒内完成执行确认。";
const ENGLISH_SAMPLE = "Put cell-01 on gnb-001 into low-power mode, reduce energy consumption by 15%, keep downlink P95 throughput at or above 50 Mbps and RRC setup success rate at or above 99%, and acknowledge within 1 second.";

test("turns a Chinese operator request into a validated Intent IR with an auditable trace", async () => {
  const observed: string[] = [];
  const result = await parseNaturalLanguageIntent(SAMPLE, {
    now: () => FIXED_NOW,
    onStage: (stage) => observed.push(stage.stage),
  });

  assert.equal(result.parser.deterministic, true);
  assert.deepEqual(result.intent.target, { gnbId: "gnb-001", cellIds: ["cell-01"] });
  assert.deepEqual(result.intent.objective, {
    metric: "energy_consumption",
    direction: "decrease",
    target: 0.15,
  });
  assert.deepEqual(result.intent.constraints, [
    { metric: "rrc_setup_success_rate", op: ">=", value: 0.99 },
    { metric: "dl_throughput_p95_mbps", op: ">=", value: 50 },
  ]);
  assert.equal(result.intent.execution.controlDeadlineMs, 1_000);
  assert.equal(result.intent.execution.maxInferenceMs, 800);
  assert.deepEqual(observed, [
    "NATURAL_LANGUAGE_RECEIVED",
    "TARGET_EXTRACTED",
    "OBJECTIVE_NORMALIZED",
    "CONSTRAINTS_MAPPED",
    "ACTION_SCOPE_BOUND",
    "EXECUTION_POLICY_MAPPED",
    "INTENT_IR_GENERATED",
    "INTENT_IR_VALIDATED",
  ]);
  assert.equal(result.stages.at(-1)?.output && (result.stages.at(-1)?.output as any).valid, true);
  assert.equal(result.elapsedMs <= result.traceElapsedMs, true);
});

test("maps the injected model-timeout scenario into the visible inference budget", async () => {
  const result = await parseNaturalLanguageIntent(SAMPLE, {
    now: () => FIXED_NOW,
    scenario: "model_timeout",
  });

  assert.equal(result.intent.execution.controlDeadlineMs, 1_000);
  assert.equal(result.intent.execution.maxInferenceMs, 120);
});

test("accepts an equivalent English operator intent", async () => {
  const result = await parseNaturalLanguageIntent(ENGLISH_SAMPLE, { now: () => FIXED_NOW });

  assert.deepEqual(result.intent.target, { gnbId: "gnb-001", cellIds: ["cell-01"] });
  assert.equal(result.intent.objective.target, 0.15);
  assert.deepEqual(result.intent.constraints, [
    { metric: "rrc_setup_success_rate", op: ">=", value: 0.99 },
    { metric: "dl_throughput_p95_mbps", op: ">=", value: 50 },
  ]);
  assert.equal(result.intent.execution.controlDeadlineMs, 1_000);
});

test("rejects empty or targetless natural-language input before runtime execution", async () => {
  await assert.rejects(() => parseNaturalLanguageIntent("   "), (error: unknown) => {
    return error instanceof IntentParseError && error.code === "EMPTY_INTENT";
  });
  await assert.rejects(() => parseNaturalLanguageIntent("请将这个小区切换为低功耗模式"), (error: unknown) => {
    return error instanceof IntentParseError && error.code === "TARGET_NOT_FOUND";
  });
});
