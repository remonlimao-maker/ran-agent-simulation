import { setTimeout as delay } from "node:timers/promises";

import { validateIntent } from "./guardrail.ts";
import type { StationIntent } from "./types.ts";

export type IntentParseStageName =
  | "NATURAL_LANGUAGE_RECEIVED"
  | "INTENT_MODEL_REQUEST_BUILT"
  | "INTENT_MODEL_TOOL_CALL"
  | "TARGET_EXTRACTED"
  | "OBJECTIVE_NORMALIZED"
  | "CONSTRAINTS_MAPPED"
  | "ACTION_SCOPE_BOUND"
  | "EXECUTION_POLICY_MAPPED"
  | "INTENT_IR_GENERATED"
  | "INTENT_IR_VALIDATED";

export interface IntentParseStage {
  sequence: number;
  stage: IntentParseStageName;
  label: string;
  elapsedMs: number;
  output: unknown;
}

export interface IntentParseResult {
  parser: {
    name: "synthetic-intent-agent";
    version: "0.1";
    deterministic: true;
  };
  naturalLanguage: string;
  intent: StationIntent;
  stages: IntentParseStage[];
  /** Parser work only; excludes observer callbacks and optional trace pacing. */
  elapsedMs: number;
  /** Wall time including optional trace pacing used by the live console. */
  traceElapsedMs: number;
}

export interface IntentParserOptions {
  now?: () => Date;
  scenario?: "success" | "model_timeout" | "du_timeout";
  stageDelayMs?: number;
  onStage?: (stage: IntentParseStage) => void | Promise<void>;
}

export class IntentParseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "IntentParseError";
    this.code = code;
  }
}

export function computeMaxInferenceMs(
  controlDeadlineMs: number,
  scenario?: IntentParserOptions["scenario"],
): number {
  const controlReserveMs = Math.max(1, Math.min(200, Math.floor(controlDeadlineMs * 0.2)));
  return Math.min(
    scenario === "model_timeout" ? 120 : 9_000,
    Math.max(1, controlDeadlineMs - controlReserveMs),
  );
}

export async function parseNaturalLanguageIntent(
  input: string,
  options: IntentParserOptions = {},
): Promise<IntentParseResult> {
  const naturalLanguage = input.trim();
  if (!naturalLanguage) throw new IntentParseError("EMPTY_INTENT", "natural-language intent must not be empty");
  if (naturalLanguage.length > 1_200) {
    throw new IntentParseError("INTENT_TOO_LONG", "natural-language intent must not exceed 1200 characters");
  }

  const startedAtMs = performance.now();
  let observerElapsedMs = 0;
  const stages: IntentParseStage[] = [];
  const parserElapsedMs = () => roundMs(performance.now() - startedAtMs - observerElapsedMs);
  const emit = async (stage: IntentParseStageName, label: string, output: unknown) => {
    const event: IntentParseStage = {
      sequence: stages.length + 1,
      stage,
      label,
      elapsedMs: parserElapsedMs(),
      output: structuredClone(output),
    };
    stages.push(event);
    const observerStartedAtMs = performance.now();
    await options.onStage?.(structuredClone(event));
    if ((options.stageDelayMs ?? 0) > 0) await delay(options.stageDelayMs);
    observerElapsedMs += performance.now() - observerStartedAtMs;
  };

  await emit("NATURAL_LANGUAGE_RECEIVED", "接收运营商自然语言意图 / Receive operator intent", { text: naturalLanguage });

  const target = extractTarget(naturalLanguage);
  await emit("TARGET_EXTRACTED", "识别网络对象与作用范围 / Extract target scope", target);

  const objective = extractObjective(naturalLanguage);
  await emit("OBJECTIVE_NORMALIZED", "将业务目标归一化为指标目标 / Normalize objective", objective);

  const constraints = extractConstraints(naturalLanguage);
  await emit("CONSTRAINTS_MAPPED", "提取必须持续满足的 KPI 约束 / Map KPI constraints", constraints);

  const allowedActions: StationIntent["allowedActions"] = ["set_energy_saving_mode"];
  await emit("ACTION_SCOPE_BOUND", "绑定最小动作白名单 / Bind action allowlist", {
    allowedActions,
    rationale: "节能意图只暴露低功耗模式切换工具",
  });

  const controlDeadlineMs = extractDeadlineMs(naturalLanguage);
  const maxInferenceMs = computeMaxInferenceMs(controlDeadlineMs, options.scenario);
  const execution: StationIntent["execution"] = {
    controlDeadlineMs,
    maxInferenceMs,
    maxCells: target.cellIds.length,
    completionSemantics: "ACTION_ACK",
    timeoutPolicy: "SAFE_NOOP",
  };
  await emit("EXECUTION_POLICY_MAPPED", "生成时限、完成语义与超时策略 / Map execution policy", execution);

  const now = options.now?.() ?? new Date();
  const intent: StationIntent = {
    schemaVersion: "0.1",
    intentId: `intent-live-${crypto.randomUUID()}`,
    issuedAt: new Date(now.getTime() - 1_000).toISOString(),
    validUntil: new Date(now.getTime() + 60_000).toISOString(),
    target,
    objective,
    constraints,
    allowedActions,
    execution,
  };
  await emit("INTENT_IR_GENERATED", "组装版本化 Intent IR / Build versioned Intent IR", intent);

  const validated = validateIntent(intent, now);
  await emit("INTENT_IR_VALIDATED", "通过确定性 Schema 与时效校验 / Validate schema and freshness", {
    valid: true,
    schemaVersion: validated.schemaVersion,
    intentId: validated.intentId,
  });

  return {
    parser: { name: "synthetic-intent-agent", version: "0.1", deterministic: true },
    naturalLanguage,
    intent: validated,
    stages,
    elapsedMs: parserElapsedMs(),
    traceElapsedMs: roundMs(performance.now() - startedAtMs),
  };
}

function extractTarget(text: string): StationIntent["target"] {
  const gnb = text.match(/\bgnb[-_]?\d+\b/i)?.[0];
  const cells = [...text.matchAll(/\bcell[-_]?\d+\b/gi)].map((match) => normalizeId(match[0], "cell"));
  if (!gnb || cells.length === 0) {
    throw new IntentParseError("TARGET_NOT_FOUND", "intent must name a gNB and at least one cell, for example gnb-001 / cell-01");
  }
  return {
    gnbId: normalizeId(gnb, "gnb"),
    cellIds: [...new Set(cells)],
  };
}

function extractObjective(text: string): StationIntent["objective"] {
  if (!/(?:节能|低功耗|降低能耗|减少能耗|low[- ]?power|energy saving|reduce energy|energy consumption)/i.test(text)) {
    throw new IntentParseError("OBJECTIVE_NOT_SUPPORTED", "the synthetic parser currently supports energy-saving intents");
  }
  const targetMatch = text.match(/(?:降低|减少)(?:能耗|能源消耗)?\s*(\d+(?:\.\d+)?)\s*%/i)
    ?? text.match(/(?:节能目标|目标节能|节能)\s*(\d+(?:\.\d+)?)\s*%/i)
    ?? text.match(/(?:reduce|decrease|cut)[^,.;，。；]*?(\d+(?:\.\d+)?)\s*%/i);
  const target = targetMatch ? Number(targetMatch[1]) / 100 : undefined;
  return {
    metric: "energy_consumption",
    direction: "decrease",
    ...(target === undefined ? {} : { target }),
  };
}

function extractConstraints(text: string): StationIntent["constraints"] {
  const constraints: StationIntent["constraints"] = [];
  const rrcMatch = text.match(/RRC[^，,。;；]*?(\d+(?:\.\d+)?)\s*%/i);
  if (rrcMatch) {
    constraints.push({
      metric: "rrc_setup_success_rate",
      op: ">=",
      value: Number(rrcMatch[1]) / 100,
    });
  }
  const throughputMatch = text.match(/(?:吞吐|throughput)[^，,。;；]*?(\d+(?:\.\d+)?)\s*(?:Mbps|Mb\/s|兆)/i);
  if (throughputMatch) {
    constraints.push({
      metric: "dl_throughput_p95_mbps",
      op: ">=",
      value: Number(throughputMatch[1]),
    });
  }
  return constraints;
}

function extractDeadlineMs(text: string): number {
  const milliseconds = text.match(/(\d+(?:\.\d+)?)\s*(?:ms|毫秒)/i);
  const seconds = text.match(/(\d+(?:\.\d+)?)\s*(?:秒|seconds?)/i);
  const value = milliseconds
    ? Number(milliseconds[1])
    : seconds
      ? Number(seconds[1]) * 1_000
      : 1_000;
  if (!Number.isInteger(value) || value < 50 || value > 10_000) {
    throw new IntentParseError("INVALID_DEADLINE", "control deadline must be an integer between 50 and 10000 ms");
  }
  return value;
}

function normalizeId(value: string, prefix: "gnb" | "cell"): string {
  const digits = value.match(/\d+/)?.[0];
  if (!digits) throw new IntentParseError("INVALID_TARGET", `invalid ${prefix} identifier`);
  return `${prefix}-${digits.padStart(prefix === "gnb" ? 3 : 2, "0")}`;
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
