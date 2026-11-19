import { createServer, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";

import { DuSimulator } from "./du-simulator.ts";
import { parseNaturalLanguageIntentWithModel } from "./intent-model.ts";
import { parseNaturalLanguageIntent, type IntentParseStage } from "./intent-parser.ts";
import { isLoopbackModelUrl, LocalModelTelemetryMonitor } from "./local-model-telemetry.ts";
import { PiStationAgentAdapter } from "./pi-adapter.ts";
import { createLocalPiRunner } from "./pi-local.ts";
import { PiAgentOneShotRunner, type PiAuditEvent } from "./pi-runner.ts";
import { estimateModelCapacity, InferenceResourceMonitor, type ResourcePhase } from "./resource-monitor.ts";
import { RuleBasedAgent } from "./rule-agent.ts";
import { StationAgentRuntime } from "./runtime.ts";
import { renderLiveUi } from "./live-ui.ts";
import type {
  ActionProposal,
  DecisionContext,
  DecisionInput,
  RunResult,
  StationDecisionAgent,
} from "./types.ts";

export type RunMode = "rules" | "pi-faux" | "pi-api";
export type Scenario = "success" | "model_timeout" | "du_timeout";
export type IntentMode = "synthetic" | "intent-api";
export type ModelRole = "intent" | "station";

export interface RunRequest {
  intentMode: IntentMode;
  mode: RunMode;
  scenario: Scenario;
  naturalLanguage: string;
  demoPaceMs: number;
}

export interface RemoteModelConfig {
  baseUrl: string;
  modelId: string;
  apiKey?: string;
  source: "default" | "environment" | "session";
}

export interface PublicRemoteModelConfig {
  role: ModelRole;
  configured: boolean;
  baseUrl: string;
  modelId: string;
  apiKeyConfigured: boolean;
  source: RemoteModelConfig["source"];
  persistence: "process_memory";
}

const DEFAULT_INTENT_MODEL_ID = "Qwen/Qwen3-8B";
const DEFAULT_STATION_BASE_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_STATION_MODEL_ID = "qwen3:0.6b";

interface LiveMessage {
  kind:
    | "hello"
    | "run_started"
    | "intent_parse_started"
    | "intent_parse_stage"
    | "intent_ir_ready"
    | "resource_sample"
    | "local_resource_sample"
    | "resource_summary"
    | "event"
    | "run_complete"
    | "run_error";
  [key: string]: unknown;
}

export interface LiveControlServer {
  server: Server;
  listen(port?: number): Promise<{ host: "127.0.0.1"; port: number; url: string }>;
  close(): Promise<void>;
  getState(): { running: boolean; clientCount: number; lastResult?: RunResult };
}

export function createLiveControlServer(): LiveControlServer {
  const clients = new Set<ServerResponse>();
  let running = false;
  let lastResult: RunResult | undefined;
  const modelConfigs: Record<ModelRole, RemoteModelConfig> = {
    intent: modelConfigFromEnvironment("intent"),
    station: modelConfigFromEnvironment("station"),
  };

  const broadcast = (message: LiveMessage): void => {
    const frame = formatSseMessage(message);
    for (const client of clients) {
      try {
        if (client.writableEnded || client.destroyed) {
          clients.delete(client);
          continue;
        }
        client.write(frame);
      } catch {
        clients.delete(client);
        client.destroy();
      }
    }
  };

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/") {
        sendText(response, 200, renderLiveUi(), "text/html; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, {
          ok: true,
          running,
          clientCount: clients.size,
          lastStatus: lastResult?.status ?? null,
          intentApiConfigured: Boolean(modelConfigs.intent.baseUrl),
          intentModelId: modelConfigs.intent.modelId,
          stationApiConfigured: Boolean(modelConfigs.station.baseUrl),
          stationModelId: modelConfigs.station.modelId,
          remoteApiConfigured: Boolean(modelConfigs.station.baseUrl),
          remoteModelId: modelConfigs.station.modelId,
          capacityEstimate: estimateModelCapacity({
            modelId: modelConfigs.station.modelId,
            inferenceBudgetMs: 800,
          }),
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/model-config") {
        const role = parseModelRole(url.searchParams.get("role"));
        if (!role) {
          sendJson(response, 400, { error: "role must be intent or station" });
          return;
        }
        sendJson(response, 200, publicModelConfig(role, modelConfigs[role]));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/model-config") {
        if (running) {
          sendJson(response, 409, { error: "model configuration cannot change while a task is running" });
          return;
        }
        let body: unknown;
        try {
          body = await readJsonBody(request);
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          return;
        }
        const role = parseModelRole(body && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>).role
          : undefined);
        if (!role) {
          sendJson(response, 400, { error: "role must be intent or station" });
          return;
        }
        const parsed = parseModelConfigUpdate(body, modelConfigs[role]);
        if (!parsed.ok) {
          sendJson(response, 400, { error: parsed.error });
          return;
        }
        modelConfigs[role] = parsed.value;
        sendJson(response, 200, publicModelConfig(role, modelConfigs[role]));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/events") {
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        });
        clients.add(response);
        response.write(`data: ${JSON.stringify({ kind: "hello", running })}\n\n`);
        const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15_000);
        heartbeat.unref();
        request.on("close", () => {
          clearInterval(heartbeat);
          clients.delete(response);
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/run") {
        if (running) {
          sendJson(response, 409, { error: "a synthetic task is already running" });
          return;
        }
        let body: unknown;
        try {
          body = await readJsonBody(request);
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
          return;
        }
        const parsed = parseRunRequest(body);
        if (!parsed.ok) {
          sendJson(response, 400, { error: parsed.error });
          return;
        }
        running = true;
        const runId = crypto.randomUUID();
        sendJson(response, 202, { runId, accepted: true });
        const taskModelConfigs = structuredClone(modelConfigs);
        broadcast({
          kind: "run_started",
          runId,
          ...parsed.value,
          deadlineMs: 1_000,
          intentModelId: parsed.value.intentMode === "intent-api"
            ? taskModelConfigs.intent.modelId
            : "synthetic-intent-agent/0.1 (no model)",
          intentResponseSource: parsed.value.intentMode === "intent-api" ? "remote_api" : "synthetic_parser",
          stationModelId: modelIdForMode(parsed.value.mode, taskModelConfigs.station),
          stationResponseSource: parsed.value.mode === "pi-api"
            ? (isLoopbackModelUrl(taskModelConfigs.station.baseUrl) ? "local_model" : "remote_api")
            : parsed.value.mode === "pi-faux"
              ? "preset_fixture"
              : "no_model",
          modelId: modelIdForMode(parsed.value.mode, taskModelConfigs.station),
          modelResponseSource: parsed.value.mode === "pi-api"
            ? (isLoopbackModelUrl(taskModelConfigs.station.baseUrl) ? "local_model" : "remote_api")
            : parsed.value.mode === "pi-faux"
              ? "preset_fixture"
              : "no_model",
        });
        void runSyntheticTask(runId, parsed.value, broadcast, { modelConfigs: taskModelConfigs }).then((result) => {
          lastResult = result;
          running = false;
          broadcast({ kind: "run_complete", runId, result });
        }).catch((error) => {
          running = false;
          broadcast({ kind: "run_error", runId, error: error instanceof Error ? error.message : String(error) });
        });
        return;
      }
      sendJson(response, 404, { error: "not found" });
    } catch (error) {
      if (!response.headersSent) sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
      else response.end();
    }
  });

  return {
    server,
    listen: (port = 4175) => new Promise((resolveListen, reject) => {
      const onError = (error: Error) => reject(error);
      server.once("error", onError);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", onError);
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("live server did not receive a TCP address"));
          return;
        }
        resolveListen({ host: "127.0.0.1", port: address.port, url: `http://127.0.0.1:${address.port}` });
      });
    }),
    close: () => new Promise((resolveClose, reject) => {
      for (const client of clients) client.end();
      clients.clear();
      if (!server.listening) {
        resolveClose();
        return;
      }
      server.close((error) => error ? reject(error) : resolveClose());
    }),
    getState: () => ({ running, clientCount: clients.size, lastResult }),
  };
}

export async function runSyntheticTask(
  runId: string,
  request: RunRequest,
  broadcast: (message: LiveMessage) => void,
  options: {
    parseStageDelayMs?: number;
    resourceSampleIntervalMs?: number;
    modelConfigs?: Record<ModelRole, RemoteModelConfig>;
  } = {},
): Promise<RunResult> {
  const modelConfigs = options.modelConfigs ?? {
    intent: modelConfigFromEnvironment("intent"),
    station: modelConfigFromEnvironment("station"),
  };
  broadcast({
    kind: "intent_parse_started",
    runId,
    label: request.intentMode === "intent-api"
      ? "网管大模型正在解析 / Management LLM parsing"
      : "网管合成解析器正在解析 / Synthetic intent parser",
    parser: request.intentMode === "intent-api"
      ? modelConfigs.intent.modelId
      : "synthetic-intent-agent/0.1 (no model)",
    modelResponseSource: request.intentMode === "intent-api" ? "remote_api" : "synthetic_parser",
  });
  const parserOptions = {
    scenario: request.scenario,
    stageDelayMs: options.parseStageDelayMs ?? request.demoPaceMs,
    onStage: (stage: IntentParseStage) => broadcast({
      kind: "intent_parse_stage",
      runId,
      stream: "intent-agent",
      stage,
    }),
  };
  const parsed = request.intentMode === "intent-api"
    ? await parseNaturalLanguageIntentWithModel(request.naturalLanguage, modelConfigs.intent, parserOptions)
    : await parseNaturalLanguageIntent(request.naturalLanguage, parserOptions);
  broadcast({
    kind: "intent_ir_ready",
    runId,
    parser: parsed.parser,
    parseElapsedMs: parsed.elapsedMs,
    traceElapsedMs: parsed.traceElapsedMs,
    intentIr: parsed.intent,
  });

  const startedAtMs = performance.now();
  const controlElapsed = () => Math.round((performance.now() - startedAtMs) * 100) / 100;
  const du = makeDu(request.scenario === "du_timeout" ? 1_200 : 35);
  const resourceMonitor = new InferenceResourceMonitor({
    backend: request.mode,
    modelId: modelIdForMode(request.mode, modelConfigs.station),
    capacityModelId: modelConfigs.station.modelId,
    inferenceBudgetMs: parsed.intent.execution.maxInferenceMs,
    sampleIntervalMs: options.resourceSampleIntervalMs,
    onSample: (sample) => broadcast({ kind: "resource_sample", runId, sample }),
  });
  const localModelMonitor = request.mode === "pi-api" && isLoopbackModelUrl(modelConfigs.station.baseUrl)
    ? new LocalModelTelemetryMonitor({
      baseUrl: modelConfigs.station.baseUrl,
      modelId: modelConfigs.station.modelId,
      sampleIntervalMs: 100,
      onSample: (sample) => broadcast({ kind: "local_resource_sample", runId, sample }),
    })
    : undefined;
  resourceMonitor.start();
  localModelMonitor?.start();
  let unsubscribe: () => void = () => undefined;

  try {
    const decisionAgent = makeAgent(request, modelConfigs.station, (event) => {
      resourceMonitor.recordPiUsage(event);
      broadcast({
        kind: "event",
        runId,
        stream: "pi-agent",
        controlElapsedMs: controlElapsed(),
        event,
      });
    });
    const runtime = new StationAgentRuntime(decisionAgent, du);
    unsubscribe = runtime.subscribe((event) => {
      updateResourcePhase(resourceMonitor, event.type);
      if (localModelMonitor) updateResourcePhase(localModelMonitor, event.type);
      broadcast({
        kind: "event",
        runId,
        stream: "runtime",
        controlElapsedMs: controlElapsed(),
        event,
      });
    });
    return await runtime.run(parsed.intent);
  } finally {
    unsubscribe();
    const summary = resourceMonitor.stop();
    if (localModelMonitor) {
      summary.localModel = await localModelMonitor.stop(summary.tokenUsage);
      summary.measurementScope = "agent_and_local_model";
      summary.modelServerMetrics = summary.localModel.available ? "local_observed" : "local_unavailable";
      summary.caveats = summary.localModel.available
        ? [
          "Agent CPU/RSS and local model/GPU metrics are measured separately.",
          ...summary.localModel.notes,
        ]
        : [
          "The endpoint is local, but model/GPU counters were unavailable for this run.",
          "Capacity values remain analytical estimates until local telemetry is available.",
        ];
    }
    broadcast({ kind: "resource_summary", runId, summary });
  }
}

function makeAgent(
  request: RunRequest,
  remoteModelConfig: RemoteModelConfig,
  onPiEvent: (event: PiAuditEvent) => void,
): StationDecisionAgent {
  if (request.mode === "rules") {
    return request.scenario === "model_timeout" ? new SlowRulesAgent(500) : new RuleBasedAgent();
  }
  if (request.mode === "pi-api") {
    const baseUrl = remoteModelConfig.baseUrl;
    if (!baseUrl) {
      throw new Error("remote model API is not configured; use the Model API setup panel or environment variables");
    }
    const modelId = remoteModelConfig.modelId;
    return new PiStationAgentAdapter(createLocalPiRunner({
      baseUrl,
      modelId,
      apiKey: remoteModelConfig.apiKey,
      onEvent: onPiEvent,
    }), modelId);
  }
  const faux = fauxProvider(request.scenario === "model_timeout" ? { tokensPerSecond: 4 } : undefined);
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
  return new PiStationAgentAdapter(new PiAgentOneShotRunner({
    model: faux.getModel(),
    streamFn: models.streamSimple.bind(models),
    onEvent: onPiEvent,
  }), "Pi faux provider / no model inference");
}

class SlowRulesAgent implements StationDecisionAgent {
  readonly name = "rules-delayed-fixture";
  readonly latencyMs: number;

  constructor(latencyMs: number) {
    this.latencyMs = latencyMs;
  }

  async decide(input: DecisionInput, context: DecisionContext): Promise<ActionProposal> {
    await delay(this.latencyMs, undefined, { signal: context.signal });
    const cell = input.snapshots[0];
    return {
      actionName: "set_energy_saving_mode",
      target: { gnbId: cell.gnbId, cellId: cell.cellId },
      parameters: { mode: "LOW_POWER" },
      expectedConfigVersion: cell.configVersion,
    };
  }
}

function makeDu(ackDelayMs: number): DuSimulator {
  return new DuSimulator([{
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
  }], { ackDelayMs });
}

export function parseRunRequest(value: unknown): { ok: true; value: RunRequest } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "request body must be an object" };
  const record = value as Record<string, unknown>;
  const intentMode = record.intentMode ?? "synthetic";
  if (intentMode !== "synthetic" && intentMode !== "intent-api") {
    return { ok: false, error: "intentMode must be synthetic or intent-api" };
  }
  if (record.mode !== "rules" && record.mode !== "pi-faux" && record.mode !== "pi-api") {
    return { ok: false, error: "mode must be rules, pi-faux, or pi-api" };
  }
  if (record.scenario !== "success" && record.scenario !== "model_timeout" && record.scenario !== "du_timeout") {
    return { ok: false, error: "scenario must be success, model_timeout, or du_timeout" };
  }
  if (typeof record.naturalLanguage !== "string" || record.naturalLanguage.trim().length === 0) {
    return { ok: false, error: "naturalLanguage must be a non-empty string" };
  }
  if (record.naturalLanguage.length > 1_200) {
    return { ok: false, error: "naturalLanguage must not exceed 1200 characters" };
  }
  const demoPaceMs = record.demoPaceMs ?? 300;
  if (!Number.isInteger(demoPaceMs) || (demoPaceMs as number) < 0 || (demoPaceMs as number) > 1_000) {
    return { ok: false, error: "demoPaceMs must be an integer between 0 and 1000" };
  }
  return {
    ok: true,
    value: {
      intentMode,
      mode: record.mode,
      scenario: record.scenario,
      naturalLanguage: record.naturalLanguage.trim(),
      demoPaceMs: demoPaceMs as number,
    },
  };
}

export function parseModelConfigUpdate(
  value: unknown,
  current: RemoteModelConfig = modelConfigFromEnvironment("station"),
): { ok: true; value: RemoteModelConfig } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "model configuration must be an object" };
  }
  const record = value as Record<string, unknown>;
  if (typeof record.baseUrl !== "string" || record.baseUrl.trim().length === 0) {
    return { ok: false, error: "baseUrl must be a non-empty absolute URL" };
  }
  if (record.baseUrl.length > 2_048) return { ok: false, error: "baseUrl must not exceed 2048 characters" };
  if (typeof record.modelId !== "string" || record.modelId.trim().length === 0) {
    return { ok: false, error: "modelId must be a non-empty string" };
  }
  if (record.modelId.length > 256) return { ok: false, error: "modelId must not exceed 256 characters" };
  if (record.apiKey !== undefined && typeof record.apiKey !== "string") {
    return { ok: false, error: "apiKey must be a string when provided" };
  }
  if (typeof record.apiKey === "string" && record.apiKey.length > 8_192) {
    return { ok: false, error: "apiKey must not exceed 8192 characters" };
  }

  let endpoint: URL;
  try {
    endpoint = new URL(record.baseUrl.trim());
  } catch {
    return { ok: false, error: "baseUrl must be a valid absolute URL" };
  }
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") {
    return { ok: false, error: "baseUrl must use https, or http for a trusted local endpoint" };
  }
  if (endpoint.username || endpoint.password) {
    return { ok: false, error: "baseUrl must not contain embedded credentials" };
  }
  if (endpoint.search || endpoint.hash) {
    return { ok: false, error: "baseUrl must not contain a query string or fragment" };
  }

  const suppliedKey = typeof record.apiKey === "string" ? record.apiKey.trim() : "";
  const apiKey = suppliedKey || current.apiKey;
  const loopback = endpoint.hostname === "localhost"
    || endpoint.hostname.endsWith(".localhost")
    || endpoint.hostname === "127.0.0.1"
    || endpoint.hostname === "[::1]";
  if (endpoint.protocol === "http:" && !loopback && apiKey) {
    return { ok: false, error: "an API key may only be sent to an https or loopback endpoint" };
  }

  return {
    ok: true,
    value: {
      baseUrl: endpoint.href.replace(/\/$/, ""),
      modelId: record.modelId.trim(),
      apiKey,
      source: "session",
    },
  };
}

export function publicModelConfig(role: ModelRole, config: RemoteModelConfig): PublicRemoteModelConfig {
  return {
    role,
    configured: Boolean(config.baseUrl),
    baseUrl: config.baseUrl,
    modelId: config.modelId,
    apiKeyConfigured: Boolean(config.apiKey),
    source: config.source,
    persistence: "process_memory",
  };
}

function modelConfigFromEnvironment(role: ModelRole): RemoteModelConfig {
  const environmentBaseUrl = role === "intent"
    ? process.env.RAN_INTENT_MODEL_BASE_URL?.trim()
    : process.env.RAN_STATION_MODEL_BASE_URL?.trim() || process.env.RAN_MODEL_BASE_URL?.trim();
  const baseUrl = role === "intent"
    ? environmentBaseUrl ?? ""
    : environmentBaseUrl ?? DEFAULT_STATION_BASE_URL;
  const modelId = role === "intent"
    ? process.env.RAN_INTENT_MODEL_ID?.trim() || DEFAULT_INTENT_MODEL_ID
    : process.env.RAN_STATION_MODEL_ID?.trim() || process.env.RAN_MODEL_ID?.trim() || DEFAULT_STATION_MODEL_ID;
  const apiKey = role === "intent"
    ? process.env.RAN_INTENT_MODEL_API_KEY?.trim() || undefined
    : process.env.RAN_STATION_MODEL_API_KEY?.trim() || process.env.RAN_MODEL_API_KEY?.trim() || undefined;
  return {
    baseUrl,
    modelId,
    apiKey,
    source: environmentBaseUrl ? "environment" : "default",
  };
}

function parseModelRole(value: unknown): ModelRole | undefined {
  if (value === undefined || value === null || value === "") return "station";
  return value === "intent" || value === "station" ? value : undefined;
}

function modelIdForMode(mode: RunMode, remoteModelConfig: RemoteModelConfig): string {
  if (mode === "pi-api") return remoteModelConfig.modelId;
  if (mode === "pi-faux") return "Pi faux provider (no model)";
  return "rules baseline (no model)";
}

function updateResourcePhase(monitor: { setPhase(phase: ResourcePhase): void }, eventType: string): void {
  if (eventType === "MODEL_STARTED") monitor.setPhase("inference");
  else if (eventType === "MODEL_COMPLETED" || eventType === "PLAN_VALIDATED") monitor.setPhase("guardrail");
  else if (eventType === "TOOL_DISPATCHED") monitor.setPhase("function");
  else if (eventType === "ACTION_ACK" || eventType === "SAFE_NOOP" || eventType === "REJECTED") monitor.setPhase("complete");
}

export function formatSseMessage(message: Record<string, unknown>): string {
  return `data: ${JSON.stringify(message)}\n\n`;
}

async function readJsonBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 16_384) throw new Error("request body exceeds 16 KiB");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("request body must be valid JSON");
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  sendText(response, status, `${JSON.stringify(value)}\n`, "application/json; charset=utf-8");
}

function sendText(response: ServerResponse, status: number, value: string, contentType: string): void {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
  });
  response.end(value);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  const app = createLiveControlServer();
  const port = Number.parseInt(process.env.RAN_LIVE_PORT ?? "4175", 10);
  const address = await app.listen(port);
  process.stdout.write(`RAN Agent live console: ${address.url}\n`);
}
