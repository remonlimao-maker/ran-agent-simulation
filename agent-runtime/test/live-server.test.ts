import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveControlServer,
  formatSseMessage,
  parseModelConfigUpdate,
  parseRunRequest,
  publicModelConfig,
  runSyntheticTask,
} from "../src/live-server.ts";
import { renderLiveUi } from "../src/live-ui.ts";

const NATURAL_LANGUAGE = "请将 gnb-001 的 cell-01 设为低功耗模式，目标降低能耗 15%，下行 P95 吞吐不得低于 50 Mbps，RRC 成功率不得低于 99%，并在 1 秒内确认。";

test("renders a self-contained live console with local SSE and run controls", () => {
  const page = renderLiveUi();

  assert.match(page, /RAN Agent 实时控制台/);
  assert.match(page, /Live Control Room/);
  assert.match(page, /new EventSource\('\/api\/events'\)/);
  assert.match(page, /fetch\('\/api\/run'/);
  assert.match(page, /intent_parse_stage/);
  assert.match(page, /结构化 Intent IR/);
  assert.match(page, /naturalLanguage/);
  assert.match(page, /无模型 \/ no model/);
  assert.match(page, /远端模型 API \/ Remote API/);
  assert.match(page, /运行资源实测 \/ Live resources/);
  assert.match(page, /芯片容量规划 \/ Capacity estimate/);
  assert.match(page, /演示节奏 \/ Demo pace/);
  assert.match(page, /Pi Agent 执行与调用过程 \/ Execution trace/);
  assert.match(page, /模型 API 配置 \/ Model API setup/);
  assert.match(page, /id="apiBaseUrl"/);
  assert.match(page, /id="apiModelId"/);
  assert.match(page, /id="apiKey" type="password"/);
  assert.match(page, /fetch\('\/api\/model-config'/);
  assert.match(page, /Key 不会持久化/);
  assert.match(page, /SAFE_NOOP/);
  assert.match(page, /color-scheme: light/);
  assert.doesNotMatch(page, /color-scheme: dark|#071019|#0d202a/, "the live UI must remain light");
  assert.doesNotMatch(page, /https?:\/\//, "the live UI must not depend on remote assets");
});

test("validates an in-memory model API configuration without exposing its key", () => {
  const parsed = parseModelConfigUpdate({
    baseUrl: "https://models.example.test/v1/",
    modelId: "Qwen/Qwen3-0.6B",
    apiKey: "test-secret",
  }, {
    baseUrl: "",
    modelId: "Qwen/Qwen3-0.6B",
    source: "default",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value, {
    baseUrl: "https://models.example.test/v1",
    modelId: "Qwen/Qwen3-0.6B",
    apiKey: "test-secret",
    source: "session",
  });
  assert.deepEqual(publicModelConfig(parsed.value), {
    configured: true,
    baseUrl: "https://models.example.test/v1",
    modelId: "Qwen/Qwen3-0.6B",
    apiKeyConfigured: true,
    source: "session",
    persistence: "process_memory",
  });
  assert.equal("apiKey" in publicModelConfig(parsed.value), false);
});

test("allows keyed loopback APIs but blocks sending a key over remote http", () => {
  const current = {
    baseUrl: "",
    modelId: "Qwen/Qwen3-0.6B",
    source: "default" as const,
  };
  assert.equal(parseModelConfigUpdate({
    baseUrl: "http://127.0.0.1:8000/v1",
    modelId: "local-qwen",
    apiKey: "local-key",
  }, current).ok, true);
  assert.equal(parseModelConfigUpdate({
    baseUrl: "http://models.example.test/v1",
    modelId: "remote-qwen",
    apiKey: "unsafe-key",
  }, current).ok, false);
  assert.equal(parseModelConfigUpdate({
    baseUrl: "file:///tmp/model",
    modelId: "bad-scheme",
  }, current).ok, false);
});

test("accepts rules, faux, and remote API modes with three bounded scenarios", () => {
  assert.deepEqual(parseRunRequest({ mode: "rules", scenario: "success", naturalLanguage: NATURAL_LANGUAGE }), {
    ok: true,
    value: { mode: "rules", scenario: "success", naturalLanguage: NATURAL_LANGUAGE, demoPaceMs: 300 },
  });
  assert.deepEqual(parseRunRequest({ mode: "pi-faux", scenario: "du_timeout", naturalLanguage: NATURAL_LANGUAGE }), {
    ok: true,
    value: { mode: "pi-faux", scenario: "du_timeout", naturalLanguage: NATURAL_LANGUAGE, demoPaceMs: 300 },
  });
  assert.deepEqual(parseRunRequest({ mode: "pi-api", scenario: "success", naturalLanguage: NATURAL_LANGUAGE }), {
    ok: true,
    value: { mode: "pi-api", scenario: "success", naturalLanguage: NATURAL_LANGUAGE, demoPaceMs: 300 },
  });
  assert.equal(parseRunRequest({ mode: "shell", scenario: "success", naturalLanguage: NATURAL_LANGUAGE }).ok, false);
  assert.equal(parseRunRequest({ mode: "rules", scenario: "live-ran", naturalLanguage: NATURAL_LANGUAGE }).ok, false);
  assert.equal(parseRunRequest({ mode: "rules", scenario: "success", naturalLanguage: "" }).ok, false);
  assert.equal(parseRunRequest({ mode: "rules", scenario: "success", naturalLanguage: NATURAL_LANGUAGE, demoPaceMs: 1_001 }).ok, false);
  assert.equal(parseRunRequest(null).ok, false);
});

test("formats one JSON message as an SSE frame and creates an idle server", () => {
  const frame = formatSseMessage({ kind: "event", stream: "runtime", event: { type: "ACTION_ACK" } });
  assert.equal(frame.endsWith("\n\n"), true);
  assert.deepEqual(JSON.parse(frame.slice("data: ".length).trim()), {
    kind: "event",
    stream: "runtime",
    event: { type: "ACTION_ACK" },
  });

  const app = createLiveControlServer();
  assert.equal(app.server.listening, false);
  assert.deepEqual(app.getState(), { running: false, clientCount: 0, lastResult: undefined });
});

test("runs the real Pi-faux loop and emits both Pi and runtime audit events", async () => {
  const messages: any[] = [];
  const result = await runSyntheticTask(
    "test-live-pi",
    { mode: "pi-faux", scenario: "success", naturalLanguage: NATURAL_LANGUAGE, demoPaceMs: 0 },
    (message) => messages.push(message),
    { parseStageDelayMs: 0 },
  );

  assert.equal(result.status, "succeeded");
  assert.equal(messages.some((message) => message.kind === "intent_parse_started"), true);
  assert.equal(messages.filter((message) => message.kind === "intent_parse_stage").length, 8);
  assert.equal(messages.some((message) => message.kind === "intent_ir_ready"
    && message.intentIr.schemaVersion === "0.1"
    && typeof message.parseElapsedMs === "number"
    && typeof message.traceElapsedMs === "number"), true);
  assert.equal(messages.some((message) => message.kind === "resource_sample"), true);
  assert.equal(messages.some((message) => message.kind === "resource_summary"
    && message.summary.measurementScope === "agent_client_process"
    && message.summary.modelServerMetrics === "not_applicable"), true);
  assert.equal(messages.some((message) => message.stream === "pi-agent" && message.event.type === "agent_start"), true);
  assert.equal(messages.some((message) => message.stream === "pi-agent"
    && message.event.type === "tool_execution_start"
    && message.event.toolArguments.mode === "LOW_POWER"), true);
  assert.equal(messages.some((message) => message.stream === "runtime"
    && message.event.type === "MODEL_STARTED"
    && message.event.detail.request.tools[0].name === "set_energy_saving_mode"), true);
  assert.equal(messages.some((message) => message.stream === "runtime"
    && message.event.type === "MODEL_COMPLETED"
    && message.event.detail.proposal.parameters.mode === "LOW_POWER"), true);
  assert.equal(messages.some((message) => message.stream === "runtime" && message.event.type === "ACTION_ACK"), true);
});
