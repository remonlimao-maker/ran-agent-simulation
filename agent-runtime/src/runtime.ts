import { DeadlineError, GuardrailError } from "./errors.ts";
import { EventJournal, type EventListener } from "./event-journal.ts";
import { validateAction, validateIntent, validateSnapshotConstraints } from "./guardrail.ts";
import { DuSimulator, STATION_TOOLS } from "./du-simulator.ts";
import type { RunResult, StationDecisionAgent, StationIntent } from "./types.ts";

export interface RuntimeOptions {
  now?: () => Date;
}

export class StationAgentRuntime {
  readonly #agent: StationDecisionAgent;
  readonly #du: DuSimulator;
  readonly #now: () => Date;
  readonly #listeners = new Set<EventListener>();
  readonly #intentLedger = new Map<string, number>();

  constructor(agent: StationDecisionAgent, du: DuSimulator, options: RuntimeOptions = {}) {
    this.#agent = agent;
    this.#du = du;
    this.#now = options.now ?? (() => new Date());
  }

  subscribe(listener: EventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async run(rawIntent: unknown): Promise<RunResult> {
    const startedAtMs = performance.now();
    const intentId = getIntentId(rawIntent);
    const journal = new EventJournal(intentId, startedAtMs, this.#listeners);
    journal.append("INTENT_RECEIVED", "cu-agent", { agent: this.#agent.name, model: this.#agent.model ?? null });

    let intent: StationIntent | undefined;
    let deadlineAtMs = startedAtMs;
    const controller = new AbortController();

    try {
      intent = validateIntent(rawIntent, this.#now());
      this.#claimIntent(intent);
      deadlineAtMs = startedAtMs + intent.execution.controlDeadlineMs;
      journal.append("SCHEMA_VALIDATED", "guardrail", {
        controlDeadlineMs: intent.execution.controlDeadlineMs,
        maxInferenceMs: intent.execution.maxInferenceMs,
        timeoutPolicy: intent.execution.timeoutPolicy,
      });

      const snapshots = this.#du.getSnapshots(intent.target.gnbId, intent.target.cellIds);
      validateSnapshotConstraints(intent, snapshots);
      journal.append("SNAPSHOT_CAPTURED", "du-executor", {
        cells: snapshots.length,
        configVersions: Object.fromEntries(snapshots.map((snapshot) => [snapshot.cellId, snapshot.configVersion])),
      });

      const inferenceBudgetMs = Math.min(intent.execution.maxInferenceMs, remainingMs(deadlineAtMs));
      if (inferenceBudgetMs <= 0) throw new DeadlineError("control", "no budget remains for inference");
      const inferenceDeadlineAtMs = performance.now() + inferenceBudgetMs;
      journal.append("MODEL_STARTED", "cu-agent", {
        budgetMs: roundMs(inferenceBudgetMs),
        candidateTools: intent.allowedActions,
        model: this.#agent.model ?? null,
        request: {
          objective: intent.objective,
          constraints: intent.constraints,
          cells: snapshots.map((snapshot) => ({
            cellId: snapshot.cellId,
            configVersion: snapshot.configVersion,
            energySavingMode: snapshot.energySavingMode,
            metrics: snapshot.metrics,
          })),
          tools: STATION_TOOLS.filter((tool) => intent.allowedActions.includes(tool.name)),
        },
      });
      const proposal = await raceWithTimeout(
        this.#agent.decide(
          {
            intent,
            snapshots,
            tools: STATION_TOOLS.filter((tool) => intent!.allowedActions.includes(tool.name)),
          },
          { signal: controller.signal, deadlineAtMs },
        ),
        inferenceBudgetMs,
        () => {
          const error = new DeadlineError("inference", "model exceeded maxInferenceMs");
          controller.abort(error);
          return error;
        },
      );
      if (performance.now() >= inferenceDeadlineAtMs) {
        const error = new DeadlineError("inference", "model exceeded maxInferenceMs");
        controller.abort(error);
        throw error;
      }
      if (performance.now() >= deadlineAtMs) throw new DeadlineError("control", "control deadline expired after inference");
      journal.append("MODEL_COMPLETED", "cu-agent", { proposal });

      const action = validateAction(intent, proposal, snapshots);
      journal.append("PLAN_VALIDATED", "guardrail", {
        actionName: action.actionName,
        target: action.target,
        parameters: action.parameters,
        expectedConfigVersion: action.expectedConfigVersion,
      });

      const executionBudgetMs = remainingMs(deadlineAtMs);
      if (executionBudgetMs <= 0) throw new DeadlineError("control", "no budget remains for tool execution");
      journal.append("TOOL_DISPATCHED", "du-executor", {
        actionName: action.actionName,
        target: action.target,
        parameters: action.parameters,
        expectedConfigVersion: action.expectedConfigVersion,
        remainingBudgetMs: roundMs(executionBudgetMs),
        dryRun: intent.execution.dryRun ?? false,
      });
      const ack = await raceWithTimeout(
        this.#du.execute(action, {
          signal: controller.signal,
          deadlineAtMs,
          dryRun: intent.execution.dryRun ?? false,
        }),
        executionBudgetMs,
        () => {
          const error = new DeadlineError("execution", "DU did not ACK before control deadline");
          controller.abort(error);
          return error;
        },
      );
      journal.append("ACTION_ACK", "du-executor", ack);
      const elapsedMs = roundMs(performance.now() - startedAtMs);
      return {
        intentId: intent.intentId,
        status: "succeeded",
        elapsedMs,
        slaMs: intent.execution.controlDeadlineMs,
        slaMet: elapsedMs <= intent.execution.controlDeadlineMs,
        action,
        ack,
        events: journal.snapshot(),
      };
    } catch (error) {
      const elapsedMs = roundMs(performance.now() - startedAtMs);
      const slaMs = intent?.execution.controlDeadlineMs ?? 0;
      if (error instanceof DeadlineError || isAbortError(error)) {
        journal.append("SAFE_NOOP", "guardrail", {
          reason: error instanceof Error ? error.message : "deadline exceeded",
          phase: error instanceof DeadlineError ? error.phase : "control",
          lateResultsDiscarded: true,
        });
        return {
          intentId: intent?.intentId ?? intentId,
          status: "safe_timeout",
          elapsedMs,
          slaMs,
          slaMet: false,
          reason: error instanceof Error ? error.message : "deadline exceeded",
          events: journal.snapshot(),
        };
      }

      const reason = error instanceof Error ? error.message : String(error);
      journal.append("REJECTED", "guardrail", {
        reason,
        code: error instanceof GuardrailError ? error.code : "AGENT_FAILURE",
      });
      return {
        intentId: intent?.intentId ?? intentId,
        status: "rejected",
        elapsedMs,
        slaMs,
        slaMet: slaMs > 0 && elapsedMs <= slaMs,
        reason,
        events: journal.snapshot(),
      };
    }
  }

  #claimIntent(intent: StationIntent): void {
    const nowMs = this.#now().getTime();
    for (const [intentId, expiresAtMs] of this.#intentLedger) {
      if (expiresAtMs < nowMs) this.#intentLedger.delete(intentId);
    }
    if (this.#intentLedger.has(intent.intentId)) {
      throw new GuardrailError("REPLAYED_INTENT", `intent ${intent.intentId} was already claimed`);
    }
    this.#intentLedger.set(intent.intentId, new Date(intent.validUntil).getTime());
  }
}

async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  createError: () => DeadlineError,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(createError()), Math.max(0, timeoutMs));
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function remainingMs(deadlineAtMs: number): number {
  return Math.max(0, deadlineAtMs - performance.now());
}

function getIntentId(value: unknown): string {
  if (value && typeof value === "object" && "intentId" in value && typeof value.intentId === "string") {
    return value.intentId;
  }
  return "unknown";
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
