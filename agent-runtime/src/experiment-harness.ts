import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";

import { DuSimulator } from "./du-simulator.ts";
import type { PiOneShotRunner } from "./pi-adapter.ts";
import { PiStationAgentAdapter } from "./pi-adapter.ts";
import { createLocalPiRunner } from "./pi-local.ts";
import { PiAgentOneShotRunner } from "./pi-runner.ts";
import { RuleBasedAgent } from "./rule-agent.ts";
import { StationAgentRuntime } from "./runtime.ts";
import type { CellSnapshot, RunStatus, StationDecisionAgent, StationIntent } from "./types.ts";

export type ExperimentMode = "rules" | "pi-faux" | "pi-local";
export type StartState = "warm" | "cold";
export type PrecisionLabel = "INT4" | "INT8";

export interface ExperimentConfig {
  mode: ExperimentMode;
  runsPerCondition: number;
  slaProfilesMs: number[];
  startStates: StartState[];
  precisions: PrecisionLabel[];
  latencyByPrecisionMs: Record<PrecisionLabel, number>;
  coldStartPenaltyMs: number;
  ackDelayMs: number;
  maxInferenceMs: number;
  outputDir?: string;
  modelId?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface ExperimentRunRow {
  experimentId: string;
  runId: string;
  mode: ExperimentMode;
  modelId: string;
  precision: PrecisionLabel;
  startState: StartState;
  slaMs: number;
  maxInferenceMs: number;
  simulatedModelLatencyMs: number | null;
  ackDelayMs: number;
  synthetic: boolean;
  status: RunStatus;
  taskCorrect: boolean;
  toolExactMatch: boolean;
  parameterExactMatch: boolean;
  safeCompleted: boolean;
  deadlineMet: boolean;
  actionApplied: boolean;
  proposedActionName: string | null;
  proposedMode: string | null;
  elapsedMs: number;
  clientRssMiB: number;
  terminalEvent: string;
  reason: string | null;
}

export interface ConditionSummary {
  mode: ExperimentMode;
  modelId: string;
  precision: PrecisionLabel;
  startState: StartState;
  slaMs: number;
  simulatedModelLatencyMs: number | null;
  runs: number;
  taskCorrectRate: number;
  toolExactMatchRate: number;
  parameterExactMatchRate: number;
  safeCompletionRate: number;
  timeoutRate: number;
  rejectionRate: number;
  deadlineMetRate: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  peakClientRssMiB: number;
}

export interface ExperimentReport {
  schemaVersion: "0.1";
  experimentId: string;
  generatedAt: string;
  config: ExperimentConfig;
  environment: {
    node: string;
    platform: NodeJS.Platform;
    arch: string;
  };
  provenance: {
    synthetic: boolean;
    caveats: string[];
  };
  rows: ExperimentRunRow[];
  summaries: ConditionSummary[];
}

export async function runExperiment(config: ExperimentConfig): Promise<ExperimentReport> {
  validateConfig(config);
  const experimentId = `ran-exp-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
  const rows: ExperimentRunRow[] = [];

  for (const precision of config.precisions) {
    for (const startState of config.startStates) {
      for (const slaMs of config.slaProfilesMs) {
        for (let runIndex = 0; runIndex < config.runsPerCondition; runIndex += 1) {
          const simulatedModelLatencyMs = config.mode === "pi-faux"
            ? config.latencyByPrecisionMs[precision] + (startState === "cold" ? config.coldStartPenaltyMs : 0)
            : null;
          const maxInferenceMs = Math.max(1, Math.min(config.maxInferenceMs, slaMs - 50));
          const agent = createAgent(config, simulatedModelLatencyMs ?? 0);
          const runtime = new StationAgentRuntime(agent, makeDu(config.ackDelayMs));
          const rssBefore = process.memoryUsage().rss;
          const result = await runtime.run(makeIntent(slaMs, maxInferenceMs));
          const rssAfter = process.memoryUsage().rss;
          const proposal = proposalFromResult(result);
          const toolExactMatch = proposal?.actionName === "set_energy_saving_mode"
            && proposal.target?.gnbId === "gnb-001"
            && proposal.target?.cellId === "cell-01";
          const parameterExactMatch = toolExactMatch && proposal?.parameters?.mode === "LOW_POWER";
          const taskCorrect = result.status === "succeeded"
            && parameterExactMatch
            && result.ack?.applied === true;
          rows.push({
            experimentId,
            runId: `${precision}-${startState}-${slaMs}-${runIndex + 1}`,
            mode: config.mode,
            modelId: agent.model ?? agent.name,
            precision,
            startState,
            slaMs,
            maxInferenceMs,
            simulatedModelLatencyMs,
            ackDelayMs: config.ackDelayMs,
            synthetic: config.mode !== "pi-local",
            status: result.status,
            taskCorrect,
            toolExactMatch,
            parameterExactMatch,
            safeCompleted: taskCorrect && result.slaMet,
            deadlineMet: result.slaMet,
            actionApplied: result.ack?.applied ?? false,
            proposedActionName: proposal?.actionName ?? null,
            proposedMode: typeof proposal?.parameters?.mode === "string" ? proposal.parameters.mode : null,
            elapsedMs: result.elapsedMs,
            clientRssMiB: roundMiB(Math.max(rssBefore, rssAfter)),
            terminalEvent: result.events.at(-1)?.type ?? "UNKNOWN",
            reason: result.reason ?? null,
          });
        }
      }
    }
  }

  return {
    schemaVersion: "0.1",
    experimentId,
    generatedAt: new Date().toISOString(),
    config,
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    provenance: {
      synthetic: config.mode !== "pi-local",
      caveats: provenanceCaveats(config.mode),
    },
    rows,
    summaries: summarizeConditions(rows),
  };
}

export function summarizeConditions(rows: ExperimentRunRow[]): ConditionSummary[] {
  const groups = new Map<string, ExperimentRunRow[]>();
  for (const row of rows) {
    const key = [row.mode, row.modelId, row.precision, row.startState, row.slaMs, row.simulatedModelLatencyMs].join("|");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    const latencies = group.map((row) => row.elapsedMs).sort((a, b) => a - b);
    return {
      mode: first.mode,
      modelId: first.modelId,
      precision: first.precision,
      startState: first.startState,
      slaMs: first.slaMs,
      simulatedModelLatencyMs: first.simulatedModelLatencyMs,
      runs: group.length,
      taskCorrectRate: rate(group, (row) => row.taskCorrect),
      toolExactMatchRate: rate(group, (row) => row.toolExactMatch),
      parameterExactMatchRate: rate(group, (row) => row.parameterExactMatch),
      safeCompletionRate: rate(group, (row) => row.safeCompleted),
      timeoutRate: rate(group, (row) => row.status === "safe_timeout"),
      rejectionRate: rate(group, (row) => row.status === "rejected"),
      deadlineMetRate: rate(group, (row) => row.deadlineMet),
      p50Ms: percentile(latencies, 0.5),
      p95Ms: percentile(latencies, 0.95),
      maxMs: round(latencies.at(-1) ?? 0),
      peakClientRssMiB: round(Math.max(...group.map((row) => row.clientRssMiB))),
    };
  });
}

export function runsToCsv(rows: ExperimentRunRow[]): string {
  const columns: Array<keyof ExperimentRunRow> = [
    "experimentId", "runId", "mode", "modelId", "precision", "startState", "slaMs",
    "maxInferenceMs", "simulatedModelLatencyMs", "ackDelayMs", "synthetic", "status",
    "taskCorrect", "toolExactMatch", "parameterExactMatch", "safeCompleted", "deadlineMet",
    "actionApplied", "proposedActionName", "proposedMode", "elapsedMs", "clientRssMiB",
    "terminalEvent", "reason",
  ];
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\n") + "\n";
}

export async function writeExperimentReport(report: ExperimentReport, outputDir: string): Promise<{ jsonPath: string; csvPath: string }> {
  await mkdir(outputDir, { recursive: true });
  const jsonPath = join(outputDir, `${report.experimentId}.json`);
  const csvPath = join(outputDir, `${report.experimentId}.csv`);
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(csvPath, runsToCsv(report.rows), "utf8"),
  ]);
  return { jsonPath, csvPath };
}

function createAgent(config: ExperimentConfig, syntheticDelayMs: number): StationDecisionAgent {
  if (config.mode === "rules") return new RuleBasedAgent();
  if (config.mode === "pi-local") {
    const runner = createLocalPiRunner({
      baseUrl: config.baseUrl,
      modelId: config.modelId,
      apiKey: config.apiKey,
    });
    return new PiStationAgentAdapter(runner, config.modelId ?? process.env.RAN_MODEL_ID ?? "qwen3:0.6b");
  }

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
  const piRunner = new PiAgentOneShotRunner({
    model: faux.getModel(),
    streamFn: models.streamSimple.bind(models),
  });
  return new PiStationAgentAdapter(new DelayedPiRunner(piRunner, syntheticDelayMs), "Pi faux provider / no model inference");
}

class DelayedPiRunner implements PiOneShotRunner {
  readonly #inner: PiOneShotRunner;
  readonly #delayMs: number;

  constructor(inner: PiOneShotRunner, delayMs: number) {
    this.#inner = inner;
    this.#delayMs = delayMs;
  }

  async runOneShot(request: Parameters<PiOneShotRunner["runOneShot"]>[0]) {
    await delay(this.#delayMs, undefined, { signal: request.signal });
    return this.#inner.runOneShot(request);
  }
}

function makeDu(ackDelayMs: number): DuSimulator {
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

function makeIntent(slaMs: number, maxInferenceMs: number): StationIntent {
  const now = Date.now();
  return {
    schemaVersion: "0.1",
    intentId: `intent-exp-${crypto.randomUUID()}`,
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
      controlDeadlineMs: slaMs,
      maxInferenceMs,
      maxCells: 1,
      completionSemantics: "ACTION_ACK",
      timeoutPolicy: "SAFE_NOOP",
    },
  };
}

function validateConfig(config: ExperimentConfig): void {
  if (!Number.isInteger(config.runsPerCondition) || config.runsPerCondition < 1) throw new Error("runsPerCondition must be >= 1");
  if (config.slaProfilesMs.some((value) => !Number.isInteger(value) || value < 50 || value > 10_000)) {
    throw new Error("SLA profiles must be integers in [50, 10000]");
  }
  for (const value of [config.coldStartPenaltyMs, config.ackDelayMs, config.maxInferenceMs, ...Object.values(config.latencyByPrecisionMs)]) {
    if (!Number.isFinite(value) || value < 0) throw new Error("latency and budget values must be non-negative numbers");
  }
}

function provenanceCaveats(mode: ExperimentMode): string[] {
  if (mode === "pi-faux") {
    return [
      "Pi Agent Core, event handling, tool validation, and deterministic station-function execution are real code paths.",
      "Model latency is an injected delay before Pi's deterministic faux-provider response; it is not 0.8B inference.",
      "Client RSS excludes any external model server, accelerator memory, and device power.",
    ];
  }
  if (mode === "pi-local") {
    return [
      "Precision and warm/cold values are experiment labels; the harness cannot verify or restart the external model server.",
      "Client RSS covers this Node process only; capture model-server RSS/VRAM and power separately.",
    ];
  }
  return [
    "Rules mode is the deterministic lower-bound baseline and performs no model inference.",
    "Client RSS covers this Node process only.",
  ];
}

function proposalFromResult(result: Awaited<ReturnType<StationAgentRuntime["run"]>>): ActionProposalLike | undefined {
  const event = result.events.find((candidate) => candidate.type === "MODEL_COMPLETED");
  const proposal = event?.detail.proposal;
  return proposal && typeof proposal === "object" ? proposal as ActionProposalLike : undefined;
}

interface ActionProposalLike {
  actionName?: string;
  target?: { gnbId?: string; cellId?: string };
  parameters?: Record<string, unknown>;
}

function rate<T>(items: T[], predicate: (item: T) => boolean): number {
  return round(items.filter(predicate).length / items.length);
}

function percentile(sorted: number[], quantile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return round(sorted[index]);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function roundMiB(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}
