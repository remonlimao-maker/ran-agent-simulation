import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveControlServer,
  formatSseMessage,
  parseRunRequest,
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
  assert.match(page, /SAFE_NOOP/);
  assert.match(page, /color-scheme: light/);
  assert.doesNotMatch(page, /color-scheme: dark|#071019|#0d202a/, "the live UI must remain light");
  assert.doesNotMatch(page, /https?:\/\//, "the live UI must not depend on remote assets");
});

test("accepts only the two local simulator modes and three bounded scenarios", () => {
  assert.deepEqual(parseRunRequest({ mode: "rules", scenario: "success", naturalLanguage: NATURAL_LANGUAGE }), {
    ok: true,
    value: { mode: "rules", scenario: "success", naturalLanguage: NATURAL_LANGUAGE },
  });
  assert.deepEqual(parseRunRequest({ mode: "pi-faux", scenario: "du_timeout", naturalLanguage: NATURAL_LANGUAGE }), {
    ok: true,
    value: { mode: "pi-faux", scenario: "du_timeout", naturalLanguage: NATURAL_LANGUAGE },
  });
  assert.equal(parseRunRequest({ mode: "shell", scenario: "success", naturalLanguage: NATURAL_LANGUAGE }).ok, false);
  assert.equal(parseRunRequest({ mode: "rules", scenario: "live-ran", naturalLanguage: NATURAL_LANGUAGE }).ok, false);
  assert.equal(parseRunRequest({ mode: "rules", scenario: "success", naturalLanguage: "" }).ok, false);
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
    { mode: "pi-faux", scenario: "success", naturalLanguage: NATURAL_LANGUAGE },
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
  assert.equal(messages.some((message) => message.stream === "pi-agent" && message.event.type === "agent_start"), true);
  assert.equal(messages.some((message) => message.stream === "runtime" && message.event.type === "ACTION_ACK"), true);
});
