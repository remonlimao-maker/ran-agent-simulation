import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { PiAgentOneShotRunner } from "./pi-runner.ts";
import type { ToolDescriptor } from "./types.ts";

const runs = Number.parseInt(process.env.RAN_BENCH_RUNS ?? "100", 10);
const faux = fauxProvider();
const models = createModels();
models.setProvider(faux.provider);
const response = () => fauxAssistantMessage([
  fauxToolCall("set_energy_saving_mode", {
    cellId: "cell-01",
    mode: "LOW_POWER",
  }),
], { stopReason: "toolUse" });
faux.setResponses(Array.from({ length: runs }, response));

globalThis.gc?.();
const rssBefore = process.memoryUsage().rss;
const runner = new PiAgentOneShotRunner({
  model: faux.getModel(),
  streamFn: models.streamSimple.bind(models),
});
const tools: ToolDescriptor[] = [{
  name: "set_energy_saving_mode",
  description: "Record a bounded energy-mode proposal.",
  parameterShape: { mode: ["ACTIVE", "LOW_POWER"] },
}];
const latencies: number[] = [];

for (let index = 0; index < runs; index += 1) {
  const started = performance.now();
  const controller = new AbortController();
  await runner.runOneShot({
    system: "Choose exactly one tool.",
    input: {
      intent: {
        intentId: `bench-${index}`,
        objective: { metric: "energy_consumption", direction: "decrease" },
        constraints: [],
        target: { gnbId: "gnb-001", cellIds: ["cell-01"] },
      },
      snapshots: [{
        gnbId: "gnb-001",
        cellId: "cell-01",
        configVersion: 7,
        energySavingMode: "ACTIVE",
        txPowerOffsetDb: 0,
        schedulerProfile: "balanced",
        metrics: { energy_consumption: 100 },
      }],
      tools,
    },
    tools,
    signal: controller.signal,
  });
  latencies.push(performance.now() - started);
}

globalThis.gc?.();
const rssAfter = process.memoryUsage().rss;
latencies.sort((a, b) => a - b);
const percentile = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))];

const result = {
  schemaVersion: "0.1",
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  benchmark: "Pi Agent Core one-shot loop with faux provider",
  synthetic: true,
  runs,
  p50Ms: round(percentile(0.5)),
  p95Ms: round(percentile(0.95)),
  maxMs: round(latencies.at(-1) ?? 0),
  rssBeforeMiB: mib(rssBefore),
  rssAfterMiB: mib(rssAfter),
  rssDeltaMiB: mib(rssAfter - rssBefore),
  caveat: "Measures framework/event/tool-loop overhead only; it excludes 0.8B model loading and inference.",
};
const serialized = `${JSON.stringify(result, null, 2)}\n`;
process.stdout.write(serialized);
if (process.env.RAN_BENCH_OUT) {
  const outputPath = resolve(process.env.RAN_BENCH_OUT);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  process.stdout.write(`Saved ${outputPath}\n`);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function mib(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}
