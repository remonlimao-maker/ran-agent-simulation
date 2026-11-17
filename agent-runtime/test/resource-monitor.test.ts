import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateModelCapacity,
  InferenceResourceMonitor,
} from "../src/resource-monitor.ts";

test("estimates an explicit and inspectable 0.8B INT4 planning envelope", () => {
  const estimate = estimateModelCapacity({
    totalParametersB: 0.8,
    precision: "INT4",
    contextTokens: 512,
    targetOutputTokens: 32,
    inferenceBudgetMs: 450,
  });

  assert.equal(estimate.rawWeightGB, 0.4);
  assert.equal(estimate.kvCacheMiB, 56);
  assert.equal(estimate.targetDecodeTokensPerSecond, 71.11);
  assert.equal(estimate.computeLowerBoundTops, 0.11);
  assert.equal(estimate.weightBandwidthLowerBoundGBps, 28.44);
  assert.equal(estimate.provisionalChipTops, 1);
  assert.equal(estimate.provisionalMemoryBandwidthGBps, 66);
  assert.equal(estimate.provisionalDedicatedRamGiB, 2);
  assert.equal(estimate.provisionalStorageGiB, 2);
});

test("samples the Agent client process and never claims remote server metrics", () => {
  const observed: unknown[] = [];
  const monitor = new InferenceResourceMonitor({
    backend: "pi-api",
    modelId: "Qwen/Qwen3-0.6B",
    capacityModelId: "Qwen/Qwen3-0.6B",
    inferenceBudgetMs: 450,
    sampleIntervalMs: 0,
    onSample: (sample) => observed.push(sample),
  });
  monitor.start();
  monitor.setPhase("inference");
  monitor.recordPiUsage({
    inputTokens: 120,
    outputTokens: 16,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 136,
    modelDurationMs: 210,
  });
  const summary = monitor.stop();

  assert.equal(observed.length >= 3, true);
  assert.equal(summary.peakRssMiB > 0, true);
  assert.equal(summary.modelServerMetrics, "not_visible_from_api_client");
  assert.deepEqual(summary.tokenUsage, {
    input: 120,
    output: 16,
    cacheRead: 0,
    cacheWrite: 0,
    total: 136,
    modelDurationMs: 210,
  });
  assert.match(summary.caveats.join(" "), /Node Agent process only/);
});

test("keeps the capacity target separate from a faux response source", () => {
  const monitor = new InferenceResourceMonitor({
    backend: "pi-faux",
    modelId: "Pi faux provider (no model)",
    capacityModelId: "Qwen/Qwen3-0.6B",
    inferenceBudgetMs: 450,
    sampleIntervalMs: 0,
  });
  monitor.start();
  const summary = monitor.stop();

  assert.equal(summary.modelId, "Pi faux provider (no model)");
  assert.equal(summary.capacityEstimate.modelId, "Qwen/Qwen3-0.6B");
});
