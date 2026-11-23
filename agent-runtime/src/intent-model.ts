import { setTimeout as delay } from "node:timers/promises";

import { validateIntent } from "./guardrail.ts";
import { computeMaxInferenceMs, IntentParseError, type IntentParseStage } from "./intent-parser.ts";
import type { RemoteModelConfig, Scenario } from "./live-server.ts";
import type { StationIntent } from "./types.ts";

export interface IntentModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface RemoteIntentParseResult {
  parser: {
    name: "remote-intent-model";
    version: "0.1";
    deterministic: false;
    modelId: string;
    modelDurationMs: number;
    usage: IntentModelUsage | null;
  };
  naturalLanguage: string;
  intent: StationIntent;
  stages: IntentParseStage[];
  elapsedMs: number;
  traceElapsedMs: number;
}

export interface RemoteIntentParserOptions {
  now?: () => Date;
  scenario?: Scenario;
  stageDelayMs?: number;
  timeoutMs?: number;
  onStage?: (stage: IntentParseStage) => void | Promise<void>;
  fetchFn?: typeof fetch;
}

interface IntentSemantics {
  target: unknown;
  objective: unknown;
  constraints: unknown;
  allowedActions: unknown;
  controlDeadlineMs: unknown;
}

interface MetricNormalization {
  path: string;
  from: string;
  to: string;
}

const CANONICAL_METRICS = [
  "energy_consumption",
  "dl_throughput_p95_mbps",
  "rrc_setup_success_rate",
] as const;

const METRIC_ALIASES: Readonly<Record<string, typeof CANONICAL_METRICS[number]>> = {
  energy_consumption: "energy_consumption",
  dl_throughput_p95_mbps: "dl_throughput_p95_mbps",
  dl_p95_throughput_mbps: "dl_throughput_p95_mbps",
  downlink_throughput_p95_mbps: "dl_throughput_p95_mbps",
  downlink_p95_throughput_mbps: "dl_throughput_p95_mbps",
  p95_dl_throughput_mbps: "dl_throughput_p95_mbps",
  rrc_setup_success_rate: "rrc_setup_success_rate",
  rrc_connection_setup_success_rate: "rrc_setup_success_rate",
};

const INTENT_TOOL = {
  type: "function",
  function: {
    name: "emit_intent_semantics",
    description: "Translate one operator request into bounded RAN intent semantics. Call exactly once.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        target: {
          type: "object",
          additionalProperties: false,
          properties: {
            gnbId: { type: "string", description: "Normalized gNB identifier such as gnb-001" },
            cellIds: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string" } },
          },
          required: ["gnbId", "cellIds"],
        },
        objective: {
          type: "object",
          additionalProperties: false,
          properties: {
            metric: {
              type: "string",
              enum: CANONICAL_METRICS,
              description: "Use one canonical metric identifier exactly as listed.",
            },
            direction: { type: "string", enum: ["increase", "decrease", "maintain"] },
            target: { type: "number" },
          },
          required: ["metric", "direction"],
        },
        constraints: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              metric: {
                type: "string",
                enum: CANONICAL_METRICS,
                description: "Use one canonical metric identifier exactly as listed.",
              },
              op: { type: "string", enum: [">=", "<=", "=="] },
              value: { type: "number" },
            },
            required: ["metric", "op", "value"],
          },
        },
        allowedActions: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: {
            type: "string",
            enum: ["set_energy_saving_mode", "set_tx_power_offset", "set_scheduler_profile"],
          },
        },
        controlDeadlineMs: { type: "integer", minimum: 50, maximum: 10_000 },
      },
      required: ["target", "objective", "constraints", "allowedActions", "controlDeadlineMs"],
    },
  },
} as const;

export async function parseNaturalLanguageIntentWithModel(
  input: string,
  config: RemoteModelConfig,
  options: RemoteIntentParserOptions = {},
): Promise<RemoteIntentParseResult> {
  const naturalLanguage = input.trim();
  if (!naturalLanguage) throw new IntentParseError("EMPTY_INTENT", "natural-language intent must not be empty");
  if (naturalLanguage.length > 1_200) {
    throw new IntentParseError("INTENT_TOO_LONG", "natural-language intent must not exceed 1200 characters");
  }
  if (!config.baseUrl) throw new IntentParseError("INTENT_MODEL_NOT_CONFIGURED", "management intent model API is not configured");

  const startedAtMs = performance.now();
  let observerElapsedMs = 0;
  const stages: IntentParseStage[] = [];
  const parserElapsedMs = () => roundMs(performance.now() - startedAtMs - observerElapsedMs);
  const emit = async (stage: IntentParseStage["stage"], label: string, output: unknown) => {
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
  await emit("INTENT_MODEL_REQUEST_BUILT", "构造网管大模型结构化请求 / Build management-model request", {
    modelId: config.modelId,
    tool: INTENT_TOOL.function.name,
    outputContract: "bounded intent semantics; timestamps and safety policy are injected deterministically",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  timeout.unref();
  const modelStartedAtMs = performance.now();
  let response: Response;
  try {
    response = await (options.fetchFn ?? fetch)(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.modelId,
        ...(isDirectDeepSeekEndpoint(config.baseUrl) ? { thinking: { type: "disabled" } } : {}),
        messages: [
          {
            role: "system",
            content: "You are the management-side RAN Intent Agent. Translate the operator request into one emit_intent_semantics tool call. Preserve numeric units, normalize percentages to fractions, expose only the minimum required action allowlist, and never invent cells. Do not execute station functions.",
          },
          { role: "user", content: naturalLanguage },
        ],
        tools: [INTENT_TOOL],
        tool_choice: { type: "function", function: { name: INTENT_TOOL.function.name } },
        temperature: 0,
        max_tokens: 512,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new IntentParseError("INTENT_MODEL_TIMEOUT", "management intent model timed out");
    throw new IntentParseError("INTENT_MODEL_REQUEST_FAILED", error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
  }
  const modelDurationMs = roundMs(performance.now() - modelStartedAtMs);
  const responseBody = await readProviderJson(response);
  if (!response.ok) {
    throw new IntentParseError("INTENT_MODEL_REJECTED", providerError(response.status, responseBody));
  }

  const usage = parseUsage(responseBody);
  const extracted = extractSemantics(responseBody);
  const semantics = extracted.semantics;
  await emit("INTENT_MODEL_TOOL_CALL", "大模型输出结构化语义 / Model emitted structured semantics", {
    modelId: config.modelId,
    modelDurationMs,
    usage,
    toolName: INTENT_TOOL.function.name,
    arguments: semantics,
    metricNormalizations: extracted.metricNormalizations,
  });

  const controlDeadlineMs = semantics.controlDeadlineMs;
  const now = options.now?.() ?? new Date();
  const intent: StationIntent = {
    schemaVersion: "0.1",
    intentId: `intent-live-${crypto.randomUUID()}`,
    issuedAt: new Date(now.getTime() - 1_000).toISOString(),
    validUntil: new Date(now.getTime() + 60_000).toISOString(),
    target: semantics.target as StationIntent["target"],
    objective: semantics.objective as StationIntent["objective"],
    constraints: semantics.constraints as StationIntent["constraints"],
    allowedActions: semantics.allowedActions as StationIntent["allowedActions"],
    execution: {
      controlDeadlineMs: controlDeadlineMs as number,
      maxInferenceMs: computeMaxInferenceMs(controlDeadlineMs as number, options.scenario),
      maxCells: Array.isArray((semantics.target as { cellIds?: unknown }).cellIds)
        ? (semantics.target as { cellIds: unknown[] }).cellIds.length
        : 0,
      completionSemantics: "ACTION_ACK",
      timeoutPolicy: "SAFE_NOOP",
    },
  };
  await emit("INTENT_IR_GENERATED", "由语义组装版本化 Intent IR / Assemble versioned Intent IR", intent);
  const validated = validateIntent(intent, now);
  await emit("INTENT_IR_VALIDATED", "通过确定性 Schema 与时效校验 / Validate schema and freshness", {
    valid: true,
    schemaVersion: validated.schemaVersion,
    intentId: validated.intentId,
  });

  return {
    parser: {
      name: "remote-intent-model",
      version: "0.1",
      deterministic: false,
      modelId: config.modelId,
      modelDurationMs,
      usage,
    },
    naturalLanguage,
    intent: validated,
    stages,
    elapsedMs: parserElapsedMs(),
    traceElapsedMs: roundMs(performance.now() - startedAtMs),
  };
}

function extractSemantics(body: unknown): {
  semantics: IntentSemantics;
  metricNormalizations: MetricNormalization[];
} {
  const root = requireRecord(body, "provider response");
  if (!Array.isArray(root.choices) || root.choices.length !== 1) {
    throw new IntentParseError("INTENT_MODEL_INVALID_RESPONSE", "provider must return exactly one choice");
  }
  const choice = requireRecord(root.choices[0], "provider choice");
  const message = requireRecord(choice.message, "provider message");
  if (!Array.isArray(message.tool_calls) || message.tool_calls.length !== 1) {
    throw new IntentParseError("INTENT_MODEL_INVALID_RESPONSE", "intent model must emit exactly one tool call");
  }
  const toolCall = requireRecord(message.tool_calls[0], "provider tool call");
  const fn = requireRecord(toolCall.function, "provider tool function");
  if (fn.name !== INTENT_TOOL.function.name) {
    throw new IntentParseError("INTENT_MODEL_INVALID_RESPONSE", `unexpected intent tool: ${String(fn.name)}`);
  }
  const args = typeof fn.arguments === "string" ? parseArguments(fn.arguments) : requireRecord(fn.arguments, "tool arguments");
  return normalizeIntentMetrics({
    target: args.target,
    objective: args.objective,
    constraints: args.constraints,
    allowedActions: args.allowedActions,
    controlDeadlineMs: args.controlDeadlineMs,
  });
}

function normalizeIntentMetrics(semantics: IntentSemantics): {
  semantics: IntentSemantics;
  metricNormalizations: MetricNormalization[];
} {
  const metricNormalizations: MetricNormalization[] = [];
  const normalizeField = (value: unknown, path: string): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    if (typeof record.metric !== "string") return value;
    const canonical = canonicalMetricName(record.metric);
    if (canonical === record.metric) return value;
    metricNormalizations.push({ path: `${path}.metric`, from: record.metric, to: canonical });
    return { ...record, metric: canonical };
  };

  return {
    semantics: {
      ...semantics,
      objective: normalizeField(semantics.objective, "objective"),
      constraints: Array.isArray(semantics.constraints)
        ? semantics.constraints.map((constraint, index) => normalizeField(constraint, `constraints[${index}]`))
        : semantics.constraints,
    },
    metricNormalizations,
  };
}

function canonicalMetricName(metric: string): string {
  const normalized = metric.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return METRIC_ALIASES[normalized] ?? metric;
}

function parseArguments(value: string): Record<string, unknown> {
  try {
    return requireRecord(JSON.parse(value), "tool arguments");
  } catch (error) {
    if (error instanceof IntentParseError) throw error;
    throw new IntentParseError("INTENT_MODEL_INVALID_RESPONSE", "intent tool arguments must be valid JSON");
  }
}

function parseUsage(body: unknown): IntentModelUsage | null {
  const root = requireRecord(body, "provider response");
  if (!root.usage || typeof root.usage !== "object" || Array.isArray(root.usage)) return null;
  const usage = root.usage as Record<string, unknown>;
  if (![usage.prompt_tokens, usage.completion_tokens, usage.total_tokens].every((value) => typeof value === "number")) return null;
  return {
    inputTokens: usage.prompt_tokens as number,
    outputTokens: usage.completion_tokens as number,
    totalTokens: usage.total_tokens as number,
  };
}

async function readProviderJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new IntentParseError("INTENT_MODEL_INVALID_RESPONSE", "provider response must be valid JSON");
  }
}

function providerError(status: number, body: unknown): string {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const error = (body as Record<string, unknown>).error;
    if (error && typeof error === "object" && !Array.isArray(error)) {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string" && message.length > 0) return `intent model API ${status}: ${message.slice(0, 500)}`;
    }
  }
  return `intent model API returned HTTP ${status}`;
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IntentParseError("INTENT_MODEL_INVALID_RESPONSE", `${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function isDirectDeepSeekEndpoint(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return hostname === "api.deepseek.com" || hostname.endsWith(".deepseek.com");
  } catch {
    return false;
  }
}
