# Lightweight Pi Agent Station Runtime

This is a Node/TypeScript prototype for the station side of the RAN Agent experiment. It uses `@earendil-works/pi-agent-core` 1.5.2 for one-shot tool selection and keeps actuation inside a dependency-free deterministic safety core.

```text
Operator natural language
  -> management Intent Agent: remote large model or synthetic baseline
  -> validated Intent IR
  -> schema/freshness guardrail
  -> Pi Agent Core: one 0.8B turn, thinking off, sequential tool proposal
  -> action/target/range guardrail
  -> abortable station function
  -> ACTION_ACK within controlDeadlineMs
```

The default completion clock is `validated Intent IR received -> station function ACK`. Management-side natural-language parsing is measured separately. KPI-effect observation is a separate, longer loop and is not claimed as part of the one-second ACK SLA.

## Run

Node 22.19+ is required.

```bash
npm ci
npm test
npm run demo
npm run demo:pi
npm run demo:local
npm run bench:pi
npm run live
npm run experiment -- --mode pi-faux --runs 3
```

`demo` runs the rules-only baseline. `demo:pi` runs the real Pi Agent event and tool loop against Pi's deterministic faux provider, so it needs no model server. `demo:local` calls the local OpenAI-compatible Ollama endpoint and performs real model inference. All three write newline-delimited events followed by a summary.

`npm run live` starts a light, bilingual, loopback-only console at `http://127.0.0.1:4175`. Enter a Chinese or English task to see the parsing trace, Intent IR, Pi lifecycle, Function ACK, client CPU/RSS/heap, token usage, and a separate chip-capacity estimate. Its demo pace can be real-time, fast, standard, or slow; presentation delays are excluded from the station-control SLA. The console never connects to a live RAN or exposes hidden chain-of-thought.

The visible **Two-model agent path** has two independent model cards. The management-side large model performs natural language → structured Intent semantics; the station-side small model performs Intent IR → Pi tool call. The station card defaults to local Ollama at `http://127.0.0.1:11434/v1` with `qwen3:0.6b` and needs no key. A remote management or station provider may use its own key; keys remain only in current-process memory and are never returned, logged, stored in the browser, or committed to Git.

Both model bridges accept local or remote OpenAI-compatible endpoints. A local-first launch needs only:

```bash
brew services start ollama
ollama pull qwen3:0.6b
npm run live
```

The two roles may also use different remote providers:

```bash
RAN_INTENT_MODEL_BASE_URL=https://management-model.example/v1 \
RAN_INTENT_MODEL_ID=Qwen/Qwen3-8B \
RAN_INTENT_MODEL_API_KEY=management_key \
RAN_STATION_MODEL_BASE_URL=https://station-model.example/v1 \
RAN_STATION_MODEL_ID=Qwen/Qwen3-0.6B \
RAN_STATION_MODEL_API_KEY=station_key \
npm run live
```

Select `Remote LLM` for the management Intent Agent and `Pi Agent · Local/remote small model` for the station Agent. The management adapter forces exactly one `emit_intent_semantics` tool call, then injects timestamps and safety policy deterministically and validates the resulting Intent IR. The station adapter continues to use Pi Agent Core. Legacy `RAN_MODEL_*` variables still map to the station model.

The local reference model is `qwen3:0.6b`. Ollama reports `751.63M` parameters, `Q4_K_M`, a 4K active context, and about `572 MiB` resident model memory. The station request is text-only, reasoning-off, temperature zero, and capped at 64 output tokens; the chip-planning profile remains the stricter 512-token input / 32-token output workload.

The resource panel separates evidence: rules/faux report only the Node Agent process; remote API mode adds provider-reported tokens and end-to-end timing; local Ollama mode also samples model residency and macOS system GPU/unified-memory counters. Workload-equivalent TOPS and bandwidth are derived from measured throughput and are explicitly not presented as direct chip counters. Power still requires a privileged or external meter.

The Pi execution trace exposes only operational evidence: the bounded model-request summary, tool schemas, provider-reported usage, actual tool-call name/arguments, proposal-only callback, deterministic guardrail result, Function dispatch, and ACK. It never persists assistant prose or hidden reasoning. `pi-faux` is marked as a preset fixture; only `pi-api` is marked as real model inference.

## Experiment matrix CLI

The experiment runner emits one inspectable JSON report and one flat CSV run table under `results/`:

```bash
# Real Pi loop with an injected, synthetic model delay
npm run experiment -- \
  --mode pi-faux \
  --runs 10 \
  --sla 250,500,1000,3000 \
  --starts warm,cold \
  --precisions INT4,INT8 \
  --int4-ms 180 \
  --int8-ms 260 \
  --cold-penalty-ms 700

# Rules-only lower bound
npm run experiment -- --mode rules --runs 50

# Real local model endpoint; the operator must configure precision and warm/cold state externally
npm run experiment -- \
  --mode pi-local \
  --runs 30 \
  --starts warm \
  --precisions INT4 \
  --base-url http://127.0.0.1:11434/v1 \
  --model-id qwen3:0.6b \
  --max-inference-ms 800
```

Each condition reports tool exact match, parameter exact match, task correctness, safe completion, timeout/rejection rates, deadline-met rate, P50/P95/max ACTION_ACK latency, and peak client RSS. A successful ACK alone is not counted as a correct task. In `pi-faux` mode, the Pi event/tool loop is real but the configured model latency is only an injected delay. In `pi-local` CLI mode, client RSS still excludes Ollama; use the live console for local model/GPU residency telemetry. Precision and warm/cold remain experiment labels unless the operator explicitly manages Ollama lifecycle between conditions.

## Safety properties in this prototype

- Strict, versioned `Intent`, `Action`, and `Event` contracts.
- Future-dated intents, validity windows longer than five minutes, and in-process intent-ID replay are rejected.
- Current telemetry must satisfy every declared constraint before the model is invoked.
- An action must be explicitly permitted and target a cell inside the intent scope.
- Power and enum parameters are range-checked by deterministic code.
- Optimistic configuration-version check prevents stale writes.
- Model inference has its own budget inside the overall control deadline.
- A late model result is discarded and cannot dispatch a tool.
- Station-function execution is abortable and checks the deadline immediately before commit.
- Timeout behavior is always `SAFE_NOOP`.
- A rules-only agent remains the required lower-bound baseline.

The replay ledger is currently in memory and signature verification is not implemented in this simulator. A deployment bridge must verify the NMS signature and intent hash before calling `StationAgentRuntime`, and must replace the in-memory ledger with durable storage shared across restarts.

## Pi integration boundary

`src/pi-runner.ts` is the concrete Pi Agent bridge and `src/pi-adapter.ts` translates its single tool call into an `ActionProposal`.

- A fresh, short-lived Pi `Agent` is created per intent while the model backend remains warm.
- Thinking is off, tool execution is sequential, and `terminate: true` prevents a second model turn.
- Only tools listed in the signed intent are exposed.
- A `beforeToolCall` counter rejects attempts to emit more than one proposal.
- The runtime `AbortSignal` calls `agent.abort()` and is also passed into each Pi tool callback.
- Pi lifecycle events are reduced to auditable type, timing, tool name, duration, and error fields; assistant text and hidden reasoning are not persisted.
- The model emits compact tool arguments such as `{cellId, mode}`. The runner deterministically injects gNB scope and the current config version, reducing output tokens and preventing the model from inventing those fields.
- Pi tool callbacks only record proposals. They never invoke a station function.

This boundary ensures a late, malformed, or multi-tool model result cannot bypass the one-second deadline or deterministic guardrails.

## Framework overhead benchmark

`npm run bench:pi` isolates the warm Pi event/tool loop using the faux provider. Recent 100-run samples on the current development machine show sub-millisecond P50/P95 and roughly 6–7 MiB RSS growth, but short-process samples vary. Set `RAN_BENCH_OUT=results/current/pi-framework-benchmark.json` to persist the exact run; that JSON is the source of truth. These are local synthetic framework measurements, not 0.8B inference results; run the benchmark again on the target edge hardware and measure the model process separately.

## Experiment matrix

The CLI runs reproducible rules, Pi-faux, or local-model conditions and writes raw CSV plus a JSON report:

```bash
npm run experiment -- \
  --mode pi-faux \
  --runs 10 \
  --sla 250,500,1000,3000 \
  --starts warm,cold \
  --precisions INT4,INT8 \
  --int4-ms 180 \
  --int8-ms 260 \
  --cold-penalty-ms 700
```

In `pi-faux` mode, Pi Agent Core and the safety path are real, but model latency is injected. Only `pi-local` calls an external model server; its process RSS/VRAM and power must be collected separately.

## Layout

- `contracts/`: JSON Schema for intent, action proposal, and audit event.
- `src/guardrail.ts`: dependency-free runtime validation.
- `src/runtime.ts`: one-shot control loop and event subscription.
- `src/intent-parser.ts`: observable deterministic natural-language-to-Intent-IR demo parser.
- `src/du-simulator.ts`: abortable deterministic station-function simulator (legacy internal filename).
- `src/pi-runner.ts`: current Pi Agent Core one-shot implementation.
- `src/pi-local.ts`: OpenAI-compatible local or remote model provider wiring.
- `src/resource-monitor.ts`: live Agent-process sampling and explicit chip-capacity estimator.
- `src/local-model-telemetry.ts`: local Ollama residency plus macOS GPU/unified-memory sampling and throughput-derived workload equivalents.
- `src/pi-adapter.ts`: narrow Pi-to-policy proposal boundary.
- `src/experiment-harness.ts`: repeatable SLA/precision/start-state matrix and report generation.
- `src/live-server.ts`: loopback-only SSE simulation console and intent parsing stream.
- `src/experiment-harness.ts`: reusable SLA/precision/start-state experiment runner and statistics.
- `src/experiment-cli.ts`: JSON/CSV matrix CLI.
- `test/runtime.test.ts`: core success, stale/unsafe input, timeout, and event-stream tests.
- `test/pi-runner.test.ts`: real Pi tool-loop and multi-call rejection tests.
- `test/intent-parser.test.ts`: parser output, trace order, deadline, and rejection tests.
- `test/resource-monitor.test.ts`: measurement provenance and capacity-formula tests.
