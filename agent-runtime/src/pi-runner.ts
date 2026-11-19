import {
  Agent,
  type AgentEvent,
  type AgentTool,
  type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";

import type { PiOneShotRunner } from "./pi-adapter.ts";
import type { DecisionInput, ToolDescriptor } from "./types.ts";

export interface PiAuditEvent {
  type: AgentEvent["type"];
  elapsedMs: number;
  toolName?: string;
  durationMs?: number;
  isError?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
  modelDurationMs?: number;
  messageRole?: string;
  stopReason?: string;
  errorMessage?: string;
  toolArguments?: Record<string, unknown>;
}

export interface PiAgentOneShotRunnerOptions {
  model: Model<any>;
  streamFn: StreamFn;
  onEvent?: (event: PiAuditEvent) => void | Promise<void>;
  onPayload?: (payload: unknown) => unknown | undefined | Promise<unknown | undefined>;
  onProviderStreamEvent?: (data: unknown) => void | Promise<void>;
}

/**
 * Current Pi Agent Core bridge.
 *
 * Pi tools only record a proposal. They never call a station function; the
 * deterministic StationAgentRuntime validates and dispatches the proposal.
 */
export class PiAgentOneShotRunner implements PiOneShotRunner {
  readonly #model: Model<any>;
  readonly #streamFn: StreamFn;
  readonly #onEvent?: (event: PiAuditEvent) => void | Promise<void>;
  readonly #onPayload?: PiAgentOneShotRunnerOptions["onPayload"];
  readonly #onProviderStreamEvent?: PiAgentOneShotRunnerOptions["onProviderStreamEvent"];

  constructor(options: PiAgentOneShotRunnerOptions) {
    this.#model = options.model;
    this.#streamFn = options.streamFn;
    this.#onEvent = options.onEvent;
    this.#onPayload = options.onPayload;
    this.#onProviderStreamEvent = options.onProviderStreamEvent;
  }

  async runOneShot(request: Parameters<PiOneShotRunner["runOneShot"]>[0]) {
    if (request.signal.aborted) throw abortReason(request.signal);
    const startedAtMs = performance.now();
    const attemptedCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    const decisionInput = request.input as DecisionInput;
    const tools = request.tools.map((descriptor) => proposalTool(
      descriptor,
      decisionInput.snapshots.map((snapshot) => snapshot.cellId),
    ));

    const agent = new Agent({
      initialState: {
        systemPrompt: request.system,
        model: this.#model,
        thinkingLevel: "off",
        tools,
      },
      streamFn: this.#streamFn,
      onPayload: this.#onPayload,
      onProviderStreamEvent: this.#onProviderStreamEvent,
      toolExecution: "sequential",
      beforeToolCall: async ({ toolCall, args }, signal) => {
        if (request.signal.aborted || signal?.aborted) {
          return { block: true, reason: "control deadline cancelled the decision", terminate: true };
        }
        attemptedCalls.push(normalizeToolCall(toolCall.name, args as Record<string, unknown>, decisionInput));
        if (attemptedCalls.length > 1) {
          return { block: true, reason: "only one proposal is allowed per intent", terminate: true };
        }
      },
      afterToolCall: async () => ({ terminate: true }),
      finishTurn: async () => ({ action: "end" }),
    });

    const unsubscribe = agent.subscribe((event) => {
      try {
        const pending = this.#onEvent?.(toAuditEvent(event, startedAtMs));
        if (pending && typeof pending.catch === "function") pending.catch(() => undefined);
      } catch {
        // UI/audit consumers are observational and cannot fail a control turn.
      }
    });
    const abortAgent = () => agent.abort();
    request.signal.addEventListener("abort", abortAgent, { once: true });

    try {
      await agent.prompt(compactDecisionInput(request.input));
      if (request.signal.aborted) throw abortReason(request.signal);
      return { toolCalls: attemptedCalls };
    } finally {
      request.signal.removeEventListener("abort", abortAgent);
      unsubscribe();
    }
  }
}

function proposalTool(descriptor: ToolDescriptor, cellIds: string[]): AgentTool<any, { proposalOnly: true }> {
  return {
    name: descriptor.name,
    label: descriptor.name,
    description: `${descriptor.description} This records a proposal only; it does not actuate the RAN.`,
    parameters: proposalSchema(descriptor, cellIds),
    executionMode: "sequential",
    execute: async (_toolCallId, _params, signal) => {
      signal?.throwIfAborted();
      return {
        content: [{ type: "text", text: "Proposal recorded for deterministic validation." }],
        details: { proposalOnly: true },
        terminate: true,
      };
    },
  };
}

function proposalSchema(descriptor: ToolDescriptor, cellIds: string[]): Record<string, unknown> {
  const actionParameters = actionParameterProperties(descriptor);
  return {
    type: "object",
    additionalProperties: false,
    required: ["cellId", ...Object.keys(actionParameters)],
    properties: {
      cellId: { type: "string", enum: cellIds },
      ...actionParameters,
    },
  };
}

function actionParameterProperties(descriptor: ToolDescriptor): Record<string, unknown> {
  const entries = Object.entries(descriptor.parameterShape);
  return Object.fromEntries(entries.map(([name, shape]) => {
    if (Array.isArray(shape)) return [name, { type: "string", enum: shape }];
    return [name, { type: "number", ...shape }];
  }));
}

function compactDecisionInput(input: unknown): string {
  const decision = input as DecisionInput;
  return `RAN_DECISION=${JSON.stringify({
    intentId: decision.intent.intentId,
    objective: decision.intent.objective,
    constraints: decision.intent.constraints,
    cells: decision.snapshots.map((snapshot) => ({
      cellId: snapshot.cellId,
      energySavingMode: snapshot.energySavingMode,
      txPowerOffsetDb: snapshot.txPowerOffsetDb,
      schedulerProfile: snapshot.schedulerProfile,
      metrics: snapshot.metrics,
    })),
    tools: decision.tools.map((tool) => tool.name),
  })}`;
}

function normalizeToolCall(
  name: string,
  args: Record<string, unknown>,
  input: DecisionInput,
): { name: string; arguments: Record<string, unknown> } {
  const cellId = args.cellId as string;
  const snapshot = input.snapshots.find((candidate) => candidate.cellId === cellId);
  const descriptor = input.tools.find((candidate) => candidate.name === name);
  const parameterNames = descriptor ? Object.keys(descriptor.parameterShape) : [];
  return {
    name,
    arguments: {
      target: { gnbId: input.intent.target.gnbId, cellId },
      parameters: Object.fromEntries(parameterNames.map((parameter) => [parameter, args[parameter]])),
      expectedConfigVersion: snapshot?.configVersion ?? -1,
    },
  };
}

function toAuditEvent(event: AgentEvent, startedAtMs: number): PiAuditEvent {
  const audit: PiAuditEvent = {
    type: event.type,
    elapsedMs: Math.round((performance.now() - startedAtMs) * 100) / 100,
  };
  if ("toolName" in event) audit.toolName = event.toolName;
  if (event.type === "message_start" || event.type === "message_end") audit.messageRole = event.message.role;
  if (event.type === "tool_execution_start") audit.toolArguments = structuredClone(event.args as Record<string, unknown>);
  if (event.type === "message_end" && event.message.role === "assistant") {
    audit.inputTokens = event.message.usage.input;
    audit.outputTokens = event.message.usage.output;
    audit.cacheReadTokens = event.message.usage.cacheRead;
    audit.cacheWriteTokens = event.message.usage.cacheWrite;
    audit.totalTokens = event.message.usage.totalTokens;
    audit.modelDurationMs = event.message.durationMs;
    audit.stopReason = event.message.stopReason;
    if (event.message.errorMessage) audit.errorMessage = event.message.errorMessage;
  }
  if (event.type === "tool_execution_end") {
    audit.durationMs = event.durationMs;
    audit.isError = event.isError;
  }
  return audit;
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Pi Agent decision aborted", "AbortError");
}
