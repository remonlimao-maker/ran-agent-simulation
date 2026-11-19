import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ResourcePhase, ResourceTokenUsage } from "./resource-monitor.ts";

const execFileAsync = promisify(execFile);

export interface LocalModelHardwareSample {
  sequence: number;
  elapsedMs: number;
  phase: ResourcePhase;
  provenance: "measured_local_system";
  gpuUtilizationPercent?: number;
  gpuAllocatedMiB?: number;
  gpuInUseMiB?: number;
  gpuCores?: number;
  modelResidentMiB?: number;
  modelGpuResidentMiB?: number;
  parameterSize?: string;
  quantization?: string;
  contextLength?: number;
  runtime?: string;
}

export interface LocalModelHardwareSummary {
  provenance: "measured_local_system_with_derived_workload_metrics";
  available: boolean;
  samples: number;
  peakGpuUtilizationPercent?: number;
  peakGpuAllocatedMiB?: number;
  peakGpuInUseMiB?: number;
  gpuCores?: number;
  modelResidentMiB?: number;
  modelGpuResidentMiB?: number;
  parameterSize?: string;
  quantization?: string;
  contextLength?: number;
  runtime?: string;
  observedOutputTokensPerSecond?: number;
  effectiveComputeTops?: number;
  effectiveWeightBandwidthGBps?: number;
  notes: string[];
}

export interface LocalModelTelemetryOptions {
  baseUrl: string;
  modelId: string;
  totalParametersB?: number;
  sampleIntervalMs?: number;
  onSample?: (sample: LocalModelHardwareSample) => void;
  sampleSource?: () => Promise<Omit<LocalModelHardwareSample, "sequence" | "elapsedMs" | "phase" | "provenance">>;
}

export class LocalModelTelemetryMonitor {
  readonly #options: LocalModelTelemetryOptions;
  readonly #samples: LocalModelHardwareSample[] = [];
  #phase: ResourcePhase = "guardrail";
  #startedAtMs = 0;
  #timer: NodeJS.Timeout | undefined;
  #inFlight: Promise<void> | undefined;
  #stopped = false;

  constructor(options: LocalModelTelemetryOptions) {
    this.#options = options;
  }

  start(): void {
    if (this.#startedAtMs !== 0) return;
    this.#startedAtMs = performance.now();
    void this.sample();
    const intervalMs = this.#options.sampleIntervalMs ?? 100;
    if (intervalMs > 0) {
      this.#timer = setInterval(() => void this.sample(), intervalMs);
      this.#timer.unref();
    }
  }

  setPhase(phase: ResourcePhase): void {
    this.#phase = phase;
    void this.sample();
  }

  sample(): Promise<void> {
    if (this.#stopped || this.#startedAtMs === 0) return Promise.resolve();
    if (this.#inFlight) return this.#inFlight;
    this.#inFlight = this.#collect().finally(() => {
      this.#inFlight = undefined;
    });
    return this.#inFlight;
  }

  async stop(tokenUsage: ResourceTokenUsage | null): Promise<LocalModelHardwareSummary> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    if (this.#inFlight) await this.#inFlight;
    await this.sample();
    this.#stopped = true;

    const latestModel = [...this.#samples].reverse().find((sample) => sample.modelResidentMiB !== undefined);
    const observedOutputTokensPerSecond = tokenUsage?.modelDurationMs && tokenUsage.output > 0
      ? tokenUsage.output / (tokenUsage.modelDurationMs / 1_000)
      : undefined;
    const totalParametersB = parseParameterSizeB(latestModel?.parameterSize) ?? this.#options.totalParametersB ?? 0.8;
    const residentGB = latestModel?.modelGpuResidentMiB !== undefined
      ? latestModel.modelGpuResidentMiB * 1024 * 1024 / 1e9
      : latestModel?.modelResidentMiB !== undefined
        ? latestModel.modelResidentMiB * 1024 * 1024 / 1e9
        : undefined;

    return {
      provenance: "measured_local_system_with_derived_workload_metrics",
      available: this.#samples.some(hasObservedMetric),
      samples: this.#samples.length,
      peakGpuUtilizationPercent: maxDefined(this.#samples.map((sample) => sample.gpuUtilizationPercent)),
      peakGpuAllocatedMiB: maxDefined(this.#samples.map((sample) => sample.gpuAllocatedMiB)),
      peakGpuInUseMiB: maxDefined(this.#samples.map((sample) => sample.gpuInUseMiB)),
      gpuCores: latestDefined(this.#samples.map((sample) => sample.gpuCores)),
      modelResidentMiB: latestModel?.modelResidentMiB,
      modelGpuResidentMiB: latestModel?.modelGpuResidentMiB,
      parameterSize: latestModel?.parameterSize,
      quantization: latestModel?.quantization,
      contextLength: latestModel?.contextLength,
      runtime: latestModel?.runtime,
      observedOutputTokensPerSecond: roundOptional(observedOutputTokensPerSecond),
      effectiveComputeTops: roundOptional(observedOutputTokensPerSecond === undefined
        ? undefined
        : 2 * totalParametersB * observedOutputTokensPerSecond / 1_000),
      effectiveWeightBandwidthGBps: roundOptional(observedOutputTokensPerSecond === undefined || residentGB === undefined
        ? undefined
        : residentGB * observedOutputTokensPerSecond),
      notes: [
        "GPU utilization and GPU memory counters are measured on the local Mac; GPU utilization is system-wide.",
        "A zero ioreg utilization sample does not prove the GPU was idle; short Metal workloads can fall between samples. Ollama size_vram is reported separately.",
        "Model resident memory and quantization come from the local Ollama runtime.",
        "Output tok/s uses provider token counts divided by end-to-end model duration, including prompt and API overhead.",
        "Effective TOPS and weight bandwidth are workload-equivalent estimates derived from measured throughput, not direct chip counters.",
      ],
    };
  }

  async #collect(): Promise<void> {
    let observed: Omit<LocalModelHardwareSample, "sequence" | "elapsedMs" | "phase" | "provenance">;
    try {
      observed = await (this.#options.sampleSource?.() ?? readLocalModelHardware(this.#options.baseUrl, this.#options.modelId));
    } catch {
      // Hardware telemetry is diagnostic and must never fail the control task.
      observed = {};
    }
    const sample: LocalModelHardwareSample = {
      sequence: this.#samples.length + 1,
      elapsedMs: round(performance.now() - this.#startedAtMs),
      phase: this.#phase,
      provenance: "measured_local_system",
      ...observed,
    };
    this.#samples.push(sample);
    try {
      this.#options.onSample?.(structuredClone(sample));
    } catch {
      // Observers cannot fail the control task.
    }
  }
}

export function isLoopbackModelUrl(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname;
    return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export async function readLocalModelHardware(
  baseUrl: string,
  modelId: string,
): Promise<Omit<LocalModelHardwareSample, "sequence" | "elapsedMs" | "phase" | "provenance">> {
  const [gpu, model] = await Promise.all([
    process.platform === "darwin" ? readMacGpuStatistics() : Promise.resolve({}),
    readOllamaModelState(baseUrl, modelId),
  ]);
  return { ...gpu, ...model };
}

export function parseMacGpuStatistics(output: string): Partial<LocalModelHardwareSample> {
  return {
    gpuUtilizationPercent: matchNumber(output, "Device Utilization %"),
    gpuAllocatedMiB: bytesToMiB(matchNumber(output, "Alloc system memory")),
    gpuInUseMiB: bytesToMiB(matchNumber(output, "In use system memory")),
    gpuCores: matchNumber(output, "gpu-core-count"),
  };
}

async function readMacGpuStatistics(): Promise<Partial<LocalModelHardwareSample>> {
  try {
    const { stdout } = await execFileAsync("/usr/sbin/ioreg", [
      "-r", "-c", "AGXAccelerator", "-d", "1", "-k", "PerformanceStatistics", "-l", "-w0",
    ], { maxBuffer: 2_000_000 });
    return parseMacGpuStatistics(stdout);
  } catch {
    return {};
  }
}

async function readOllamaModelState(baseUrl: string, modelId: string): Promise<Partial<LocalModelHardwareSample>> {
  if (!isLoopbackModelUrl(baseUrl)) return {};
  try {
    const endpoint = new URL(baseUrl);
    const response = await fetch(`${endpoint.origin}/api/ps`, { signal: AbortSignal.timeout(500) });
    if (!response.ok) return {};
    const body = await response.json() as { models?: Array<Record<string, unknown>> };
    const entry = body.models?.find((candidate) => candidate.name === modelId || candidate.model === modelId);
    if (!entry) return {};
    const details = entry.details && typeof entry.details === "object" ? entry.details as Record<string, unknown> : {};
    return {
      modelResidentMiB: bytesToMiB(numberOrUndefined(entry.size)),
      modelGpuResidentMiB: bytesToMiB(numberOrUndefined(entry.size_vram)),
      parameterSize: stringOrUndefined(details.parameter_size),
      quantization: stringOrUndefined(details.quantization_level),
      contextLength: numberOrUndefined(entry.context_length),
      runtime: stringOrUndefined(entry.runner),
    };
  } catch {
    return {};
  }
}

function matchNumber(output: string, key: string): number | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`"${escaped}"\\s*=\\s*(\\d+(?:\\.\\d+)?)`));
  return match ? Number(match[1]) : undefined;
}

function parseParameterSizeB(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/([\d.]+)\s*([BM])/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  return match[2].toUpperCase() === "M" ? amount / 1_000 : amount;
}

function hasObservedMetric(sample: LocalModelHardwareSample): boolean {
  return sample.gpuUtilizationPercent !== undefined || sample.modelResidentMiB !== undefined;
}

function maxDefined(values: Array<number | undefined>): number | undefined {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length > 0 ? round(Math.max(...present)) : undefined;
}

function latestDefined(values: Array<number | undefined>): number | undefined {
  return [...values].reverse().find((value): value is number => value !== undefined);
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function bytesToMiB(value: number | undefined): number | undefined {
  return value === undefined ? undefined : round(value / 1024 / 1024);
}

function roundOptional(value: number | undefined): number | undefined {
  return value === undefined ? undefined : round(value);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
