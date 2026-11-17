import type { RuntimeEvent, RuntimeEventType } from "./types.ts";

type Source = RuntimeEvent["source"];
type EventListener = (event: Readonly<RuntimeEvent>) => void | Promise<void>;

export class EventJournal {
  readonly #events: RuntimeEvent[] = [];
  readonly #intentId: string;
  readonly #startedAtMs: number;
  readonly #listeners: Set<EventListener>;

  constructor(intentId: string, startedAtMs: number, listeners: Set<EventListener>) {
    this.#intentId = intentId;
    this.#startedAtMs = startedAtMs;
    this.#listeners = listeners;
  }

  append(type: RuntimeEventType, source: Source, detail: Record<string, unknown> = {}): RuntimeEvent {
    const event: RuntimeEvent = {
      schemaVersion: "0.1",
      sequence: this.#events.length + 1,
      eventId: crypto.randomUUID(),
      intentId: this.#intentId,
      type,
      timestamp: new Date().toISOString(),
      elapsedMs: roundMs(performance.now() - this.#startedAtMs),
      source,
      detail,
    };
    this.#events.push(event);
    for (const listener of this.#listeners) {
      try {
        const pending = listener(deepFreeze(structuredClone(event)));
        if (pending && typeof pending.catch === "function") pending.catch(() => undefined);
      } catch {
        // Observability is deliberately outside the control transaction. A broken
        // UI/SSE listener must never change an actuation outcome.
      }
    }
    return structuredClone(event);
  }

  snapshot(): RuntimeEvent[] {
    return structuredClone(this.#events);
  }

  toJSONL(): string {
    return this.#events.map((event) => JSON.stringify(event)).join("\n");
  }
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export type { EventListener };
