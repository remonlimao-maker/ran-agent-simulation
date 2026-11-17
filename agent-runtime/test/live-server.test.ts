import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveControlServer,
  formatSseMessage,
  parseRunRequest,
  runSyntheticTask,
} from "../src/live-server.ts";
import { renderLiveUi } from "../src/live-ui.ts";

test("renders a self-contained live console with local SSE and run controls", () => {
  const page = renderLiveUi();

  assert.match(page, /RAN Agent Live Control Room/);
  assert.match(page, /new EventSource\('\/api\/events'\)/);
  assert.match(page, /fetch\('\/api\/run'/);
  assert.match(page, /SAFE_NOOP/);
  assert.match(page, /color-scheme: light/);
  assert.doesNotMatch(page, /color-scheme: dark|#071019|#0d202a/, "the live UI must remain light");
  assert.doesNotMatch(page, /https?:\/\//, "the live UI must not depend on remote assets");
});

test("accepts only the two local simulator modes and three bounded scenarios", () => {
  assert.deepEqual(parseRunRequest({ mode: "rules", scenario: "success" }), {
    ok: true,
    value: { mode: "rules", scenario: "success" },
  });
  assert.deepEqual(parseRunRequest({ mode: "pi-faux", scenario: "du_timeout" }), {
    ok: true,
    value: { mode: "pi-faux", scenario: "du_timeout" },
  });
  assert.equal(parseRunRequest({ mode: "shell", scenario: "success" }).ok, false);
  assert.equal(parseRunRequest({ mode: "rules", scenario: "live-ran" }).ok, false);
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
    { mode: "pi-faux", scenario: "success" },
    (message) => messages.push(message),
  );

  assert.equal(result.status, "succeeded");
  assert.equal(messages.some((message) => message.stream === "pi-agent" && message.event.type === "agent_start"), true);
  assert.equal(messages.some((message) => message.stream === "runtime" && message.event.type === "ACTION_ACK"), true);
});
