import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalModelTelemetryMonitor,
  parseMacGpuStatistics,
} from "../src/local-model-telemetry.ts";

test("parses measured Apple GPU utilization and unified-memory counters", () => {
  const parsed = parseMacGpuStatistics(`
    "PerformanceStatistics" = {"Alloc system memory"=1829814272,"Device Utilization %"=67,"In use system memory"=851968000}
    "gpu-core-count" = 14
  `);

  assert.deepEqual(parsed, {
    gpuUtilizationPercent: 67,
    gpuAllocatedMiB: 1745.05,
    gpuInUseMiB: 812.5,
    gpuCores: 14,
  });
});

test("keeps measured local telemetry separate from throughput-derived chip metrics", async () => {
  const monitor = new LocalModelTelemetryMonitor({
    baseUrl: "http://127.0.0.1:11434/v1",
    modelId: "qwen3:0.6b",
    sampleIntervalMs: 0,
    sampleSource: async () => ({
      gpuUtilizationPercent: 72,
      gpuAllocatedMiB: 1800,
      gpuInUseMiB: 900,
      gpuCores: 14,
      modelResidentMiB: 572.22,
      modelGpuResidentMiB: 572.22,
      parameterSize: "751.63M",
      quantization: "Q4_K_M",
      contextLength: 4096,
      runtime: "llamacpp",
    }),
  });
  monitor.start();
  await monitor.sample();
  monitor.setPhase("inference");
  await monitor.sample();
  const summary = await monitor.stop({
    input: 393,
    output: 34,
    cacheRead: 0,
    cacheWrite: 0,
    total: 427,
    modelDurationMs: 436,
  });

  assert.equal(summary.available, true);
  assert.equal(summary.modelGpuResidentMiB, 572.22);
  assert.equal(summary.quantization, "Q4_K_M");
  assert.equal(summary.observedOutputTokensPerSecond, 77.98);
  assert.equal(summary.effectiveComputeTops, 0.12);
  assert.equal(summary.effectiveWeightBandwidthGBps, 46.79);
  assert.match(summary.notes.join(" "), /workload-equivalent estimates/);
  assert.match(summary.notes.join(" "), /does not prove the GPU was idle/);
});
