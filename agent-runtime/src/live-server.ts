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
import { parseNaturalLanguageIntent } from "./intent-parser.ts";
import { PiStationAgentAdapter } from "./pi-adapter.ts";
import { PiAgentOneShotRunner } from "./pi-runner.ts";
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

export type RunMode = "rules" | "pi-faux";
export type Scenario = "success" | "model_timeout" | "du_timeout";

export interface RunRequest {
  mode: RunMode;
  scenario: Scenario;
  naturalLanguage: string;
}

interface LiveMessage {
  kind:
    | "hello"
    | "run_started"
    | "intent_parse_started"
    | "intent_parse_stage"
    | "intent_ir_ready"
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
        sendJson(response, 200, { ok: true, running, clientCount: clients.size, lastStatus: lastResult?.status ?? null });
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
        broadcast({ kind: "run_started", runId, ...parsed.value, deadlineMs: 1_000 });
        void runSyntheticTask(runId, parsed.value, broadcast).then((result) => {
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
  options: { parseStageDelayMs?: number } = {},
): Promise<RunResult> {
  broadcast({
    kind: "intent_parse_started",
    runId,
    label: "网管 Intent Agent 正在解析 / Parsing operator intent",
    parser: "synthetic-intent-agent/0.1",
  });
  const parsed = await parseNaturalLanguageIntent(request.naturalLanguage, {
    scenario: request.scenario,
    stageDelayMs: options.parseStageDelayMs ?? 70,
    onStage: (stage) => broadcast({
      kind: "intent_parse_stage",
      runId,
      stream: "intent-agent",
      stage,
    }),
  });
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
  const decisionAgent = makeAgent(request, (event) => broadcast({
    kind: "event",
    runId,
    stream: "pi-agent",
    controlElapsedMs: controlElapsed(),
    event,
  }));
  const runtime = new StationAgentRuntime(decisionAgent, du);
  const unsubscribe = runtime.subscribe((event) => broadcast({
    kind: "event",
    runId,
    stream: "runtime",
    controlElapsedMs: controlElapsed(),
    event,
  }));

  try {
    return await runtime.run(parsed.intent);
  } finally {
    unsubscribe();
  }
}

function makeAgent(request: RunRequest, onPiEvent: (event: unknown) => void): StationDecisionAgent {
  if (request.mode === "rules") {
    return request.scenario === "model_timeout" ? new SlowRulesAgent(500) : new RuleBasedAgent();
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
  if (record.mode !== "rules" && record.mode !== "pi-faux") return { ok: false, error: "mode must be rules or pi-faux" };
  if (record.scenario !== "success" && record.scenario !== "model_timeout" && record.scenario !== "du_timeout") {
    return { ok: false, error: "scenario must be success, model_timeout, or du_timeout" };
  }
  if (typeof record.naturalLanguage !== "string" || record.naturalLanguage.trim().length === 0) {
    return { ok: false, error: "naturalLanguage must be a non-empty string" };
  }
  if (record.naturalLanguage.length > 1_200) {
    return { ok: false, error: "naturalLanguage must not exceed 1200 characters" };
  }
  return {
    ok: true,
    value: {
      mode: record.mode,
      scenario: record.scenario,
      naturalLanguage: record.naturalLanguage.trim(),
    },
  };
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
