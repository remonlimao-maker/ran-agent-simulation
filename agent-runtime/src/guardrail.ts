import { GuardrailError } from "./errors.ts";
import type { ActionName, ActionProposal, CellSnapshot, StationIntent } from "./types.ts";

const MAX_CLOCK_SKEW_MS = 5_000;
const MAX_VALIDITY_WINDOW_MS = 5 * 60_000;

const ACTION_NAMES = new Set<ActionName>([
  "set_energy_saving_mode",
  "set_tx_power_offset",
  "set_scheduler_profile",
]);

export function validateIntent(input: unknown, now = new Date()): StationIntent {
  const value = requireObject(input, "intent");
  requireExactKeys(
    value,
    ["schemaVersion", "intentId", "issuedAt", "validUntil", "target", "objective", "constraints", "allowedActions", "execution"],
    ["schemaVersion", "intentId", "issuedAt", "validUntil", "target", "objective", "constraints", "allowedActions", "execution"],
    "intent",
  );
  requireEqual(value.schemaVersion, "0.1", "intent.schemaVersion");
  requireString(value.intentId, "intent.intentId");

  const issuedAt = requireDate(value.issuedAt, "intent.issuedAt");
  const validUntil = requireDate(value.validUntil, "intent.validUntil");
  if (validUntil.getTime() <= issuedAt.getTime()) {
    throw new GuardrailError("INVALID_VALIDITY_WINDOW", "validUntil must be later than issuedAt");
  }
  if (issuedAt.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) {
    throw new GuardrailError("FUTURE_INTENT", "intent issuedAt is beyond the allowed clock skew");
  }
  if (validUntil.getTime() - issuedAt.getTime() > MAX_VALIDITY_WINDOW_MS) {
    throw new GuardrailError("INVALID_VALIDITY_WINDOW", "intent validity window must not exceed five minutes");
  }
  if (now.getTime() > validUntil.getTime()) {
    throw new GuardrailError("STALE_INTENT", "intent validity window has expired");
  }

  const target = requireObject(value.target, "intent.target");
  requireExactKeys(target, ["gnbId", "cellIds"], ["gnbId", "cellIds"], "intent.target");
  requireString(target.gnbId, "intent.target.gnbId");
  const cellIds = requireStringArray(target.cellIds, "intent.target.cellIds");
  if (cellIds.length === 0 || new Set(cellIds).size !== cellIds.length) {
    throw new GuardrailError("INVALID_TARGET", "target.cellIds must be a non-empty unique list");
  }

  const objective = requireObject(value.objective, "intent.objective");
  requireExactKeys(objective, ["metric", "direction"], ["metric", "direction", "target"], "intent.objective");
  requireString(objective.metric, "intent.objective.metric");
  requireEnum(objective.direction, ["increase", "decrease", "maintain"], "intent.objective.direction");
  if (objective.target !== undefined) requireNumber(objective.target, "intent.objective.target");

  if (!Array.isArray(value.constraints)) {
    throw new GuardrailError("INVALID_SCHEMA", "intent.constraints must be an array");
  }
  for (const [index, item] of value.constraints.entries()) {
    const constraint = requireObject(item, `intent.constraints[${index}]`);
    requireExactKeys(constraint, ["metric", "op", "value"], ["metric", "op", "value"], `intent.constraints[${index}]`);
    requireString(constraint.metric, `intent.constraints[${index}].metric`);
    requireEnum(constraint.op, [">=", "<=", "=="], `intent.constraints[${index}].op`);
    requireNumber(constraint.value, `intent.constraints[${index}].value`);
  }

  if (!Array.isArray(value.allowedActions) || value.allowedActions.length === 0) {
    throw new GuardrailError("INVALID_SCHEMA", "intent.allowedActions must be a non-empty array");
  }
  for (const name of value.allowedActions) {
    if (!ACTION_NAMES.has(name as ActionName)) {
      throw new GuardrailError("UNKNOWN_ACTION", `unknown allowed action: ${String(name)}`);
    }
  }
  if (new Set(value.allowedActions).size !== value.allowedActions.length) {
    throw new GuardrailError("INVALID_SCHEMA", "intent.allowedActions must be unique");
  }

  const execution = requireObject(value.execution, "intent.execution");
  requireExactKeys(
    execution,
    ["controlDeadlineMs", "maxInferenceMs", "maxCells", "completionSemantics", "timeoutPolicy"],
    ["controlDeadlineMs", "maxInferenceMs", "maxCells", "completionSemantics", "timeoutPolicy", "dryRun"],
    "intent.execution",
  );
  requireIntegerRange(execution.controlDeadlineMs, 50, 10_000, "intent.execution.controlDeadlineMs");
  requireIntegerRange(execution.maxInferenceMs, 1, 9_000, "intent.execution.maxInferenceMs");
  if ((execution.maxInferenceMs as number) >= (execution.controlDeadlineMs as number)) {
    throw new GuardrailError("INVALID_BUDGET", "maxInferenceMs must leave time for validation and tool ACK");
  }
  requireIntegerRange(execution.maxCells, 1, 64, "intent.execution.maxCells");
  if (cellIds.length > (execution.maxCells as number)) {
    throw new GuardrailError("TARGET_LIMIT_EXCEEDED", "target cell count exceeds execution.maxCells");
  }
  requireEqual(execution.completionSemantics, "ACTION_ACK", "intent.execution.completionSemantics");
  requireEqual(execution.timeoutPolicy, "SAFE_NOOP", "intent.execution.timeoutPolicy");
  if (execution.dryRun !== undefined && typeof execution.dryRun !== "boolean") {
    throw new GuardrailError("INVALID_SCHEMA", "intent.execution.dryRun must be boolean");
  }

  return structuredClone(value) as unknown as StationIntent;
}

export function validateSnapshotConstraints(intent: StationIntent, snapshots: CellSnapshot[]): void {
  for (const snapshot of snapshots) {
    for (const constraint of intent.constraints) {
      const actual = snapshot.metrics[constraint.metric];
      if (actual === undefined || !Number.isFinite(actual)) {
        throw new GuardrailError(
          "TELEMETRY_MISSING",
          `${snapshot.cellId} has no fresh numeric telemetry for ${constraint.metric}`,
        );
      }
      const passed = constraint.op === ">="
        ? actual >= constraint.value
        : constraint.op === "<="
          ? actual <= constraint.value
          : actual === constraint.value;
      if (!passed) {
        throw new GuardrailError(
          "CONSTRAINT_VIOLATION",
          `${snapshot.cellId} ${constraint.metric}=${actual} violates ${constraint.op} ${constraint.value}`,
        );
      }
    }
  }
}

export function validateAction(
  intent: StationIntent,
  proposalInput: unknown,
  snapshots: CellSnapshot[] = [],
): ActionProposal {
  const proposal = requireObject(proposalInput, "proposal");
  requireExactKeys(
    proposal,
    ["actionName", "target", "parameters", "expectedConfigVersion"],
    ["actionName", "target", "parameters", "expectedConfigVersion"],
    "proposal",
  );
  const actionName = proposal.actionName as ActionName;
  if (!ACTION_NAMES.has(actionName)) {
    throw new GuardrailError("UNKNOWN_ACTION", `unknown action: ${String(proposal.actionName)}`);
  }
  if (!intent.allowedActions.includes(actionName)) {
    throw new GuardrailError("ACTION_NOT_ALLOWED", `${actionName} is outside intent.allowedActions`);
  }

  const target = requireObject(proposal.target, "proposal.target");
  requireExactKeys(target, ["gnbId", "cellId"], ["gnbId", "cellId"], "proposal.target");
  requireString(target.gnbId, "proposal.target.gnbId");
  requireString(target.cellId, "proposal.target.cellId");
  if (target.gnbId !== intent.target.gnbId || !intent.target.cellIds.includes(target.cellId as string)) {
    throw new GuardrailError("TARGET_OUT_OF_SCOPE", "action target is outside the signed intent scope");
  }
  requireIntegerRange(proposal.expectedConfigVersion, 0, Number.MAX_SAFE_INTEGER, "proposal.expectedConfigVersion");
  const parameters = requireObject(proposal.parameters, "proposal.parameters");

  if (actionName === "set_energy_saving_mode") {
    requireExactKeys(parameters, ["mode"], ["mode"], "proposal.parameters");
    requireEnum(parameters.mode, ["ACTIVE", "LOW_POWER"], "proposal.parameters.mode");
  } else if (actionName === "set_tx_power_offset") {
    requireExactKeys(parameters, ["offsetDb"], ["offsetDb"], "proposal.parameters");
    requireNumber(parameters.offsetDb, "proposal.parameters.offsetDb");
    if ((parameters.offsetDb as number) < -3 || (parameters.offsetDb as number) > 3) {
      throw new GuardrailError("PARAMETER_OUT_OF_RANGE", "tx-power offset must be within [-3, 3] dB");
    }
  } else {
    requireExactKeys(parameters, ["profile"], ["profile"], "proposal.parameters");
    requireEnum(parameters.profile, ["balanced", "latency", "throughput"], "proposal.parameters.profile");
  }

  const validated = structuredClone(proposal) as unknown as ActionProposal;
  validateActionEffect(intent, validated, snapshots);
  return validated;
}

function validateActionEffect(intent: StationIntent, action: ActionProposal, snapshots: CellSnapshot[]): void {
  const snapshot = snapshots.find((candidate) =>
    candidate.gnbId === action.target.gnbId && candidate.cellId === action.target.cellId
  );
  if (!snapshot) return;

  if (action.actionName === "set_energy_saving_mode") {
    const mode = action.parameters.mode as CellSnapshot["energySavingMode"];
    if (mode === snapshot.energySavingMode) {
      throw new GuardrailError("NO_EFFECT_ACTION", `energy-saving mode is already ${mode}`);
    }
    if (intent.objective.metric === "energy_consumption") {
      const expectedMode = intent.objective.direction === "decrease"
        ? "LOW_POWER"
        : intent.objective.direction === "increase"
          ? "ACTIVE"
          : undefined;
      if (expectedMode && mode !== expectedMode) {
        throw new GuardrailError(
          "OBJECTIVE_MISMATCH",
          `${mode} does not move energy_consumption toward ${intent.objective.direction}`,
        );
      }
    }
  } else if (action.actionName === "set_tx_power_offset") {
    if (action.parameters.offsetDb === snapshot.txPowerOffsetDb) {
      throw new GuardrailError("NO_EFFECT_ACTION", `tx-power offset is already ${snapshot.txPowerOffsetDb} dB`);
    }
  } else if (action.parameters.profile === snapshot.schedulerProfile) {
    throw new GuardrailError("NO_EFFECT_ACTION", `scheduler profile is already ${snapshot.schedulerProfile}`);
  }
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GuardrailError("INVALID_SCHEMA", `${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  required: string[],
  allowed: string[],
  path: string,
): void {
  for (const key of required) {
    if (!(key in value)) throw new GuardrailError("INVALID_SCHEMA", `${path}.${key} is required`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new GuardrailError("INVALID_SCHEMA", `${path}.${key} is not allowed`);
  }
}

function requireString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new GuardrailError("INVALID_SCHEMA", `${path} must be a non-empty string`);
  }
}

function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new GuardrailError("INVALID_SCHEMA", `${path} must be an array`);
  for (const [index, item] of value.entries()) requireString(item, `${path}[${index}]`);
  return value as string[];
}

function requireNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new GuardrailError("INVALID_SCHEMA", `${path} must be a finite number`);
  }
}

function requireIntegerRange(value: unknown, min: number, max: number, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new GuardrailError("INVALID_SCHEMA", `${path} must be an integer in [${min}, ${max}]`);
  }
}

function requireEnum(value: unknown, allowed: readonly unknown[], path: string): void {
  if (!allowed.includes(value)) {
    throw new GuardrailError("INVALID_SCHEMA", `${path} must be one of ${allowed.join(", ")}`);
  }
}

function requireEqual(value: unknown, expected: unknown, path: string): void {
  if (value !== expected) throw new GuardrailError("INVALID_SCHEMA", `${path} must equal ${String(expected)}`);
}

function requireDate(value: unknown, path: string): Date {
  requireString(value, path);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new GuardrailError("INVALID_SCHEMA", `${path} must be an ISO date-time`);
  return date;
}
