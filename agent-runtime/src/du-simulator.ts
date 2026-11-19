import { setTimeout as delay } from "node:timers/promises";

import { DeadlineError, GuardrailError } from "./errors.ts";
import type { ActionProposal, CellSnapshot, ToolDescriptor } from "./types.ts";

export const STATION_TOOLS: ToolDescriptor[] = [
  {
    name: "set_energy_saving_mode",
    description: "Set a cell to ACTIVE or LOW_POWER. For energy_consumption + decrease, mode MUST be LOW_POWER. Never select the current mode. Full shutdown is unavailable.",
    parameterShape: { mode: ["ACTIVE", "LOW_POWER"] },
  },
  {
    name: "set_tx_power_offset",
    description: "Apply a bounded transmit-power offset in dB.",
    parameterShape: { offsetDb: { minimum: -3, maximum: 3 } },
  },
  {
    name: "set_scheduler_profile",
    description: "Select one of the pre-validated scheduler profiles.",
    parameterShape: { profile: ["balanced", "latency", "throughput"] },
  },
];

export interface ExecuteContext {
  signal: AbortSignal;
  deadlineAtMs: number;
  dryRun: boolean;
}

export interface ExecuteAck {
  applied: boolean;
  configVersion: number;
}

export interface DuSimulatorOptions {
  ackDelayMs?: number | ((action: ActionProposal) => number);
}

export class DuSimulator {
  readonly #cells = new Map<string, CellSnapshot>();
  readonly #ackDelayMs: number | ((action: ActionProposal) => number);

  constructor(cells: CellSnapshot[], options: DuSimulatorOptions = {}) {
    for (const cell of cells) {
      const key = cellKey(cell.gnbId, cell.cellId);
      if (this.#cells.has(key)) throw new Error(`duplicate cell: ${key}`);
      this.#cells.set(key, structuredClone(cell));
    }
    this.#ackDelayMs = options.ackDelayMs ?? 5;
  }

  getSnapshot(gnbId: string, cellId: string): CellSnapshot {
    const cell = this.#cells.get(cellKey(gnbId, cellId));
    if (!cell) throw new GuardrailError("UNKNOWN_CELL", `cell ${gnbId}/${cellId} is unavailable`);
    return structuredClone(cell);
  }

  getSnapshots(gnbId: string, cellIds: string[]): CellSnapshot[] {
    return cellIds.map((cellId) => this.getSnapshot(gnbId, cellId));
  }

  async execute(action: ActionProposal, context: ExecuteContext): Promise<ExecuteAck> {
    assertBeforeDeadline(context.signal, context.deadlineAtMs);
    const latency = typeof this.#ackDelayMs === "function" ? this.#ackDelayMs(action) : this.#ackDelayMs;
    try {
      await delay(Math.max(0, latency), undefined, { signal: context.signal });
    } catch (error) {
      if (context.signal.aborted) {
        throw new DeadlineError("execution", "DU execution was cancelled before commit");
      }
      throw error;
    }
    assertBeforeDeadline(context.signal, context.deadlineAtMs);

    const key = cellKey(action.target.gnbId, action.target.cellId);
    const current = this.#cells.get(key);
    if (!current) throw new GuardrailError("UNKNOWN_CELL", `cell ${key} is unavailable`);
    if (current.configVersion !== action.expectedConfigVersion) {
      throw new GuardrailError(
        "CONFIG_VERSION_CONFLICT",
        `expected config version ${action.expectedConfigVersion}, current version is ${current.configVersion}`,
      );
    }

    if (context.dryRun) return { applied: false, configVersion: current.configVersion };

    const next = structuredClone(current);
    if (action.actionName === "set_energy_saving_mode") {
      next.energySavingMode = action.parameters.mode as CellSnapshot["energySavingMode"];
    } else if (action.actionName === "set_tx_power_offset") {
      next.txPowerOffsetDb = action.parameters.offsetDb as number;
    } else {
      next.schedulerProfile = action.parameters.profile as CellSnapshot["schedulerProfile"];
    }
    next.configVersion += 1;
    this.#cells.set(key, next);
    return { applied: true, configVersion: next.configVersion };
  }
}

function assertBeforeDeadline(signal: AbortSignal, deadlineAtMs: number): void {
  if (signal.aborted || performance.now() >= deadlineAtMs) {
    throw new DeadlineError("execution", "DU execution deadline expired before commit");
  }
}

function cellKey(gnbId: string, cellId: string): string {
  return `${gnbId}/${cellId}`;
}
