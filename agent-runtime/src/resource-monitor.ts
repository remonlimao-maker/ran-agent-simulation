import type { LocalModelHardwareSummary } from "./local-model-telemetry.ts";

export type ResourcePhase = "guardrail" | "inference" | "function" | "complete";
export type ResourceBackend = "rules" | "pi-faux" | "pi-api";
export type ModelPrecision = "INT4" | "INT8" | "BF16";

export interface ProcessResourceSample {
  sequence: number;
  elapsedMs: number;
  phase: ResourcePhase;
  processCpuPercent: number;
  rssMiB: number;
  heapUsedMiB: number;
  externalMiB: number;
}

export interface ModelCapacityEstimate {
  provenance: "analytical_estimate";
  modelId: string;
  totalParametersB: number;
  precision: ModelPrecision;
  contextTokens: number;
  targetOutputTokens: number;
  inferenceBudgetMs: number;
  rawWeightGB: number;
  kvCacheMiB: number;
  modelRuntimeGiB: number;
  dualSlotStorageGB: number;
  targetDecodeTokensPerSecond: number;
  computeLowerBoundTops: number;
  weightBandwidthLowerBoundGBps: number;
  provisionalChipTops: number;
  provisionalMemoryBandwidthGBps: number;
  provisionalDedicatedRamGiB: number;
  provisionalStorageGiB: number;
  assumptions: string[];
}

export interface ResourceTokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  modelDurationMs?: number;
}

export interface ResourceSummary {
  schemaVersion: "0.1";
  backend: ResourceBackend;
  modelId: string;
  measurementScope: "agent_client_process" | "agent_and_local_model";
  modelServerMetrics: "not_applicable" | "not_visible_from_api_client" | "local_observed" | "local_unavailable";
  wallTimeMs: number;
  processCpuTimeMs: number;
  peakProcessCpuPercent: number;
  peakRssMiB: number;
  peakHeapUsedMiB: number;
  samples: number;
  tokenUsage: ResourceTokenUsage | null;
  capacityEstimate: ModelCapacityEstimate;
  localModel?: LocalModelHardwareSummary;
  caveats: string[];
}

export interface ResourceMonitorOptions {
  backend: ResourceBackend;
  modelId: string;
  capacityModelId?: string;
  inferenceBudgetMs: number;
  sampleIntervalMs?: number;
  onSample?: (sample: ProcessResourceSample) => void;
  capacity?: Partial<Pick<
    ModelCapacityEstimate,
    "totalParametersB" | "precision" | "contextTokens" | "targetOutputTokens"
  >>;
}

interface PiUsageEvent {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
  modelDurationMs?: number;
}

export class InferenceResourceMonitor {
  readonly #options: ResourceMonitorOptions;
  readonly #samples: ProcessResourceSample[] = [];
  #phase: ResourcePhase = "guardrail";
  #startedAtMs = 0;
  #startedCpu = { user: 0, system: 0 };
  #lastCpu = { user: 0, system: 0 };
  #lastSampleAtMs = 0;
  #timer: NodeJS.Timeout | undefined;
  #tokenUsage: ResourceTokenUsage | null = null;
  #stopped = false;

  constructor(options: ResourceMonitorOptions) {
    this.#options = options;
  }

  start(): void {
    if (this.#startedAtMs !== 0) return;
    this.#startedAtMs = performance.now();
    this.#lastSampleAtMs = this.#startedAtMs;
    this.#startedCpu = process.cpuUsage();
    this.#lastCpu = this.#startedCpu;
    this.sample();
    const intervalMs = this.#options.sampleIntervalMs ?? 50;
    if (intervalMs > 0) {
      this.#timer = setInterval(() => this.sample(), intervalMs);
      this.#timer.unref();
    }
  }

  setPhase(phase: ResourcePhase): void {
    this.#phase = phase;
    this.sample();
  }

  recordPiUsage(event: PiUsageEvent): void {
    if (event.totalTokens === undefined) return;
    const current = this.#tokenUsage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
    current.input += event.inputTokens ?? 0;
    current.output += event.outputTokens ?? 0;
    current.cacheRead += event.cacheReadTokens ?? 0;
    current.cacheWrite += event.cacheWriteTokens ?? 0;
    current.total += event.totalTokens;
    if (event.modelDurationMs !== undefined) current.modelDurationMs = event.modelDurationMs;
    this.#tokenUsage = current;
  }

  sample(): ProcessResourceSample | undefined {
    if (this.#startedAtMs === 0 || this.#stopped) return undefined;
    const now = performance.now();
    const cpu = process.cpuUsage();
    const cpuDeltaMs = ((cpu.user - this.#lastCpu.user) + (cpu.system - this.#lastCpu.system)) / 1_000;
    const wallDeltaMs = Math.max(0.01, now - this.#lastSampleAtMs);
    const memory = process.memoryUsage();
    const sample: ProcessResourceSample = {
      sequence: this.#samples.length + 1,
      elapsedMs: round(now - this.#startedAtMs),
      phase: this.#phase,
      processCpuPercent: this.#samples.length === 0 ? 0 : round(cpuDeltaMs / wallDeltaMs * 100),
      rssMiB: mib(memory.rss),
      heapUsedMiB: mib(memory.heapUsed),
      externalMiB: mib(memory.external),
    };
    this.#lastCpu = cpu;
    this.#lastSampleAtMs = now;
    this.#samples.push(sample);
    try {
      this.#options.onSample?.(structuredClone(sample));
    } catch {
      // Resource observers are informational and cannot fail a control task.
    }
    return sample;
  }

  stop(): ResourceSummary {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    if (!this.#stopped) {
      this.#phase = "complete";
      this.sample();
      this.#stopped = true;
    }
    const cpu = process.cpuUsage(this.#startedCpu);
    const wallTimeMs = round(performance.now() - this.#startedAtMs);
    const capacityEstimate = estimateModelCapacity({
      modelId: this.#options.capacityModelId ?? this.#options.modelId,
      inferenceBudgetMs: this.#options.inferenceBudgetMs,
      ...this.#options.capacity,
    });
    const externalModel = this.#options.backend === "pi-api";
    return {
      schemaVersion: "0.1",
      backend: this.#options.backend,
      modelId: this.#options.modelId,
      measurementScope: "agent_client_process",
      modelServerMetrics: externalModel ? "not_visible_from_api_client" : "not_applicable",
      wallTimeMs,
      processCpuTimeMs: round((cpu.user + cpu.system) / 1_000),
      peakProcessCpuPercent: maxOf(this.#samples, "processCpuPercent"),
      peakRssMiB: maxOf(this.#samples, "rssMiB"),
      peakHeapUsedMiB: maxOf(this.#samples, "heapUsedMiB"),
      samples: this.#samples.length,
      tokenUsage: this.#tokenUsage ? structuredClone(this.#tokenUsage) : null,
      capacityEstimate,
      caveats: externalModel
        ? [
          "CPU and memory measurements cover this Node Agent process only.",
          "Hosted API calls do not expose model-server TOPS, RAM/VRAM, memory bandwidth, or power.",
          "Capacity values are analytical estimates until the same model is measured on controlled hardware.",
        ]
        : [
          "CPU and memory measurements cover this Node Agent process only.",
          "No real model inference runs in rules or Pi faux mode.",
          "Capacity values are analytical estimates, not measurements from this run.",
        ],
    };
  }
}

export function estimateModelCapacity(options: {
  modelId?: string;
  totalParametersB?: number;
  precision?: ModelPrecision;
  contextTokens?: number;
  targetOutputTokens?: number;
  inferenceBudgetMs?: number;
} = {}): ModelCapacityEstimate {
  const modelId = options.modelId ?? "Qwen/Qwen3-0.6B";
  const totalParametersB = options.totalParametersB ?? 0.8;
  const precision = options.precision ?? "INT4";
  const contextTokens = options.contextTokens ?? 512;
  const targetOutputTokens = options.targetOutputTokens ?? 32;
  const inferenceBudgetMs = options.inferenceBudgetMs ?? 450;
  const bytesPerParameter = precision === "INT4" ? 0.5 : precision === "INT8" ? 1 : 2;
  const rawWeightGB = totalParametersB * bytesPerParameter;
  const rawWeightGiB = rawWeightGB / 1.073741824;
  // Qwen3-0.6B reference architecture: 28 layers, 8 KV heads, head_dim 128, BF16 KV.
  const kvCacheBytes = 2 * 28 * 8 * 128 * contextTokens * 2;
  const kvCacheMiB = kvCacheBytes / 1024 / 1024;
  const modelRuntimeGiB = (rawWeightGiB + kvCacheMiB / 1024 + 0.35) * 1.25;
  const dualSlotStorageGB = rawWeightGB * 1.2 * 2 + 0.25;
  // Keep 25% of the inference budget for prompt prefill, API/runtime overhead,
  // and jitter; decoding is not allowed to consume the entire budget.
  const decodeBudgetMs = inferenceBudgetMs * 0.75;
  const targetDecodeTokensPerSecond = targetOutputTokens / (decodeBudgetMs / 1_000);
  const computeLowerBoundTops = 2 * totalParametersB * 1e9 * targetDecodeTokensPerSecond / 1e12;
  const weightBandwidthLowerBoundGBps = rawWeightGB * targetDecodeTokensPerSecond;
  const provisionalChipTops = computeLowerBoundTops / 0.25 * 2;
  const provisionalMemoryBandwidthGBps = weightBandwidthLowerBoundGBps / 0.65 * 1.5;
  return {
    provenance: "analytical_estimate",
    modelId,
    totalParametersB,
    precision,
    contextTokens,
    targetOutputTokens,
    inferenceBudgetMs,
    rawWeightGB: round(rawWeightGB),
    kvCacheMiB: round(kvCacheMiB),
    modelRuntimeGiB: round(modelRuntimeGiB),
    dualSlotStorageGB: round(dualSlotStorageGB),
    targetDecodeTokensPerSecond: round(targetDecodeTokensPerSecond),
    computeLowerBoundTops: round(computeLowerBoundTops),
    weightBandwidthLowerBoundGBps: round(weightBandwidthLowerBoundGBps),
    provisionalChipTops: roundUp(provisionalChipTops, 0.1),
    provisionalMemoryBandwidthGBps: roundUp(provisionalMemoryBandwidthGBps, 1),
    provisionalDedicatedRamGiB: Math.max(1, Math.ceil(modelRuntimeGiB * 1.5)),
    provisionalStorageGiB: Math.max(1, Math.ceil(dualSlotStorageGB / 1.073741824)),
    assumptions: [
      "Dense decoder; approximately two operations per parameter per generated token.",
      "INT4/INT8/BF16 weight bytes exclude backend-specific quantization metadata.",
      "KV cache uses the Qwen3-0.6B reference geometry and BF16 K/V values.",
      "Twenty-five percent of the inference budget is reserved for prefill, runtime overhead, and jitter.",
      "Provisional chip target assumes 25% effective compute utilization and 2x margin.",
      "Provisional bandwidth assumes 65% effective bandwidth and 1.5x margin.",
      "Storage keeps active and rollback model slots plus tokenizer/runtime allowance.",
    ],
  };
}

function maxOf(samples: ProcessResourceSample[], key: "processCpuPercent" | "rssMiB" | "heapUsedMiB"): number {
  return round(Math.max(0, ...samples.map((sample) => sample[key])));
}

function mib(bytes: number): number {
  return round(bytes / 1024 / 1024);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundUp(value: number, step: number): number {
  return round(Math.ceil(value / step) * step);
}
