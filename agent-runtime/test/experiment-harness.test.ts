import assert from "node:assert/strict";
import test from "node:test";

import {
  runExperiment,
  runsToCsv,
  summarizeConditions,
  type ExperimentConfig,
  type ExperimentRunRow,
} from "../src/experiment-harness.ts";

test("runs a reproducible rules baseline matrix and summarizes each SLA", async () => {
  const report = await runExperiment(config({
    mode: "rules",
    runsPerCondition: 2,
    slaProfilesMs: [250, 1_000],
  }));

  assert.equal(report.rows.length, 4);
  assert.equal(report.summaries.length, 2);
  assert.equal(report.rows.every((row) => row.safeCompleted), true);
  assert.equal(report.summaries.every((summary) => summary.safeCompletionRate === 1), true);
  assert.match(report.provenance.caveats.join(" "), /lower-bound baseline/);
});

test("uses a real Pi loop but turns an injected faux-model deadline miss into SAFE_NOOP", async () => {
  const report = await runExperiment(config({
    mode: "pi-faux",
    runsPerCondition: 1,
    slaProfilesMs: [250],
    latencyByPrecisionMs: { INT4: 20, INT8: 20 },
    maxInferenceMs: 5,
  }));

  assert.equal(report.rows[0].status, "safe_timeout");
  assert.equal(report.rows[0].terminalEvent, "SAFE_NOOP");
  assert.equal(report.rows[0].actionApplied, false);
  assert.equal(report.summaries[0].timeoutRate, 1);
  assert.match(report.provenance.caveats.join(" "), /not 0\.8B inference/);
});

test("computes nearest-rank percentiles and emits inspectable CSV", () => {
  const rows = [100, 200, 300, 400].map((elapsedMs, index) => row(elapsedMs, index));
  const [summary] = summarizeConditions(rows);
  const csv = runsToCsv(rows);

  assert.equal(summary.p50Ms, 200);
  assert.equal(summary.p95Ms, 400);
  assert.equal(summary.safeCompletionRate, 0.75);
  assert.match(csv, /^experimentId,runId,/);
  assert.match(csv, /"reason, with comma"/);
});

function config(overrides: Partial<ExperimentConfig>): ExperimentConfig {
  return {
    mode: "rules",
    runsPerCondition: 1,
    slaProfilesMs: [1_000],
    startStates: ["warm"],
    precisions: ["INT4"],
    latencyByPrecisionMs: { INT4: 0, INT8: 0 },
    coldStartPenaltyMs: 0,
    ackDelayMs: 1,
    maxInferenceMs: 450,
    ...overrides,
  };
}

function row(elapsedMs: number, index: number): ExperimentRunRow {
  return {
    experimentId: "exp-test",
    runId: `run-${index}`,
    mode: "rules",
    modelId: "rules-baseline",
    precision: "INT4",
    startState: "warm",
    slaMs: 1_000,
    maxInferenceMs: 450,
    simulatedModelLatencyMs: null,
    ackDelayMs: 1,
    synthetic: true,
    status: index === 3 ? "rejected" : "succeeded",
    safeCompleted: index !== 3,
    deadlineMet: true,
    actionApplied: index !== 3,
    elapsedMs,
    clientRssMiB: 80 + index,
    terminalEvent: index === 3 ? "REJECTED" : "ACTION_ACK",
    reason: index === 3 ? "reason, with comma" : null,
  };
}
