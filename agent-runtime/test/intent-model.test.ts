import assert from "node:assert/strict";
import test from "node:test";

import { parseNaturalLanguageIntentWithModel } from "../src/intent-model.ts";

const FIXED_NOW = new Date("2026-11-17T06:00:00.000Z");
const SAMPLE = "请将 gnb-001 的 cell-01 设为低功耗模式，目标降低能耗 15%，下行 P95 吞吐不得低于 50 Mbps，并在 1 秒内确认。";

test("uses a remote management model tool call to build a validated Intent IR", async () => {
  let capturedUrl = "";
  let capturedAuthorization = "";
  let capturedBody: any;
  const fetchFn: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
    capturedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      id: "chatcmpl-intent-test",
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call-intent",
            type: "function",
            function: {
              name: "emit_intent_semantics",
              arguments: JSON.stringify({
                target: { gnbId: "gnb-001", cellIds: ["cell-01"] },
                objective: { metric: "energy_consumption", direction: "decrease", target: 0.15 },
                constraints: [{ metric: "dl_throughput_p95_mbps", op: ">=", value: 50 }],
                allowedActions: ["set_energy_saving_mode"],
                controlDeadlineMs: 1_000,
              }),
            },
          }],
        },
      }],
      usage: { prompt_tokens: 190, completion_tokens: 74, total_tokens: 264 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const observed: string[] = [];
  const result = await parseNaturalLanguageIntentWithModel(SAMPLE, {
    baseUrl: "https://models.example.test/v1",
    modelId: "Qwen/Qwen3-8B",
    apiKey: "example-key-value",
    source: "session",
  }, {
    now: () => FIXED_NOW,
    fetchFn,
    onStage: (stage) => observed.push(stage.stage),
  });

  assert.equal(capturedUrl, "https://models.example.test/v1/chat/completions");
  assert.equal(capturedAuthorization, "Bearer example-key-value");
  assert.equal(capturedBody.model, "Qwen/Qwen3-8B");
  assert.equal(capturedBody.tools[0].function.name, "emit_intent_semantics");
  assert.equal("thinking" in capturedBody, false);
  assert.equal(result.parser.modelId, "Qwen/Qwen3-8B");
  assert.deepEqual(result.parser.usage, { inputTokens: 190, outputTokens: 74, totalTokens: 264 });
  assert.deepEqual(result.intent.target, { gnbId: "gnb-001", cellIds: ["cell-01"] });
  assert.equal(result.intent.execution.maxInferenceMs, 800);
  assert.deepEqual(observed, [
    "NATURAL_LANGUAGE_RECEIVED",
    "INTENT_MODEL_REQUEST_BUILT",
    "INTENT_MODEL_TOOL_CALL",
    "INTENT_IR_GENERATED",
    "INTENT_IR_VALIDATED",
  ]);
  assert.doesNotMatch(JSON.stringify(result), /example-key-value/);
});

test("disables DeepSeek thinking mode when forcing the intent tool call", async () => {
  let capturedBody: any;
  const fetchFn: typeof fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      choices: [{
        message: {
          tool_calls: [{
            function: {
              name: "emit_intent_semantics",
              arguments: JSON.stringify({
                target: { gnbId: "gnb-001", cellIds: ["cell-01"] },
                objective: { metric: "energy_consumption", direction: "decrease", target: 0.15 },
                constraints: [{ metric: "dl_throughput_p95_mbps", op: ">=", value: 50 }],
                allowedActions: ["set_energy_saving_mode"],
                controlDeadlineMs: 1_000,
              }),
            },
          }],
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  await parseNaturalLanguageIntentWithModel(SAMPLE, {
    baseUrl: "https://api.deepseek.com",
    modelId: "deepseek-flash",
    apiKey: "deepseek-test-key",
    source: "session",
  }, { now: () => FIXED_NOW, fetchFn });

  assert.deepEqual(capturedBody.thinking, { type: "disabled" });
  assert.deepEqual(capturedBody.tool_choice, {
    type: "function",
    function: { name: "emit_intent_semantics" },
  });
});

test("rejects a management model response that emits more than one tool call", async () => {
  const fetchFn: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        tool_calls: [
          { function: { name: "emit_intent_semantics", arguments: "{}" } },
          { function: { name: "emit_intent_semantics", arguments: "{}" } },
        ],
      },
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });

  await assert.rejects(() => parseNaturalLanguageIntentWithModel(SAMPLE, {
    baseUrl: "https://models.example.test/v1",
    modelId: "Qwen/Qwen3-8B",
    source: "session",
  }, { fetchFn }), /exactly one tool call/);
});
