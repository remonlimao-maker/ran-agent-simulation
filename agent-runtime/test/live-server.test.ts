import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

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

  assert.match(page, /RAN Agent 双模型测试/);
  assert.match(page, /Two-model test/);
  assert.match(page, /只验证两件事/);
  assert.match(page, /new EventSource\('\/api\/events'\)/);
  assert.match(page, /fetch\('\/api\/run'/);
  assert.match(page, /intent_parse_stage/);
  assert.match(page, /① 大模型输出：Intent JSON/);
  assert.match(page, /② 小模型输出：Tool Call/);
  assert.match(page, /③ 模拟工具执行结果/);
  assert.match(page, /id="toolCallJson"/);
  assert.match(page, /id="toolResultJson"/);
  assert.match(page, /naturalLanguage/);
  assert.match(page, /两个模型 \/ Two models/);
  assert.match(page, /网管大模型 API \/ Management LLM/);
  assert.match(page, /基站本地小模型 \/ Local station model/);
  assert.match(page, /基站阶段运行资源 \/ Station-stage resources/);
  assert.match(page, /基站小模型芯片容量规划 \/ Station capacity/);
  assert.match(page, /高级测试选项 \/ Advanced test options/);
  assert.match(page, /高级信息：完整解析阶段、Pi 轨迹、时延与资源/);
  assert.match(page, /基站 Pi Agent 完整轨迹 \/ Full execution trace/);
  assert.doesNotMatch(page, /<details class="advanced-(?:settings|lab)" open/);
  assert.doesNotMatch(page, /规则极限/);
  assert.match(page, /id="intentApiBaseUrl"/);
  assert.match(page, /id="stationApiBaseUrl"/);
  assert.match(page, /id="intentApiKey" type="password"/);
  assert.match(page, /id="stationApiKey" type="password"/);
  assert.match(page, /fetch\('\/api\/model-config\?role='/);
  assert.match(page, /本机 Ollama 小模型无需 Key/);
  assert.match(page, /local_resource_sample/);
  assert.match(page, /id="resourceGpu"/);
  assert.match(page, /id="resourceModelMemory"/);
  assert.match(page, /SAFE_NOOP/);
  assert.match(page, /NOT_INVOKED/);
  assert.match(page, /NO_TOOL_CALL/);
  assert.match(page, /color-scheme: light/);
  assert.doesNotMatch(page, /color-scheme: dark|#071019|#0d202a/, "the live UI must remain light");
  assert.doesNotMatch(page, /(?:src|href)=["']https?:\/\//, "the live UI must not depend on remote assets");
  const inlineScript = page.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(inlineScript);
  assert.doesNotThrow(() => new vm.Script(inlineScript, { filename: "live-ui-inline.js" }));
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
  assert.deepEqual(publicModelConfig("station", parsed.value), {
    role: "station",
    configured: true,
    baseUrl: "https://models.example.test/v1",
    modelId: "Qwen/Qwen3-0.6B",
    apiKeyConfigured: true,
    source: "session",
    persistence: "process_memory",
  });
  assert.equal("apiKey" in publicModelConfig("station", parsed.value), false);
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
    value: { intentMode: "synthetic", mode: "rules", scenario: "success", naturalLanguage: NATURAL_LANGUAGE, demoPaceMs: 300 },
  });
  assert.deepEqual(parseRunRequest({ mode: "pi-faux", scenario: "du_timeout", naturalLanguage: NATURAL_LANGUAGE }), {
    ok: true,
    value: { intentMode: "synthetic", mode: "pi-faux", scenario: "du_timeout", naturalLanguage: NATURAL_LANGUAGE, demoPaceMs: 300 },
  });
  assert.deepEqual(parseRunRequest({ intentMode: "intent-api", mode: "pi-api", scenario: "success", naturalLanguage: NATURAL_LANGUAGE }), {
    ok: true,
    value: { intentMode: "intent-api", mode: "pi-api", scenario: "success", naturalLanguage: NATURAL_LANGUAGE, demoPaceMs: 300 },
  });
  assert.equal(parseRunRequest({ intentMode: "shell", mode: "rules", scenario: "success", naturalLanguage: NATURAL_LANGUAGE }).ok, false);
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
    { intentMode: "synthetic", mode: "pi-faux", scenario: "success", naturalLanguage: NATURAL_LANGUAGE, demoPaceMs: 0 },
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
