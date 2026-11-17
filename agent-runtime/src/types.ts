export type ActionName =
  | "set_energy_saving_mode"
  | "set_tx_power_offset"
  | "set_scheduler_profile";

export type CompletionSemantics = "ACTION_ACK";
export type TimeoutPolicy = "SAFE_NOOP";

export interface StationIntent {
  schemaVersion: "0.1";
  intentId: string;
  issuedAt: string;
  validUntil: string;
  target: {
    gnbId: string;
    cellIds: string[];
  };
  objective: {
    metric: string;
    direction: "increase" | "decrease" | "maintain";
    target?: number;
  };
  constraints: Array<{
    metric: string;
    op: ">=" | "<=" | "==";
    value: number;
  }>;
  allowedActions: ActionName[];
  execution: {
    controlDeadlineMs: number;
    maxInferenceMs: number;
    maxCells: number;
    completionSemantics: CompletionSemantics;
    timeoutPolicy: TimeoutPolicy;
    dryRun?: boolean;
  };
}

export interface ActionProposal {
  actionName: ActionName;
  target: {
    gnbId: string;
    cellId: string;
  };
  parameters: Record<string, unknown>;
  expectedConfigVersion: number;
}

export interface CellSnapshot {
  gnbId: string;
  cellId: string;
  configVersion: number;
  energySavingMode: "ACTIVE" | "LOW_POWER";
  txPowerOffsetDb: number;
  schedulerProfile: "balanced" | "latency" | "throughput";
  metrics: Record<string, number>;
}

export interface ToolDescriptor {
  name: ActionName;
  description: string;
  parameterShape: Record<string, unknown>;
}

export interface DecisionInput {
  intent: StationIntent;
  snapshots: CellSnapshot[];
  tools: ToolDescriptor[];
}

export interface DecisionContext {
  signal: AbortSignal;
  deadlineAtMs: number;
}

export interface StationDecisionAgent {
  readonly name: string;
  readonly model?: string;
  decide(input: DecisionInput, context: DecisionContext): Promise<ActionProposal>;
}

export type RuntimeEventType =
  | "INTENT_RECEIVED"
  | "SCHEMA_VALIDATED"
  | "SNAPSHOT_CAPTURED"
  | "MODEL_STARTED"
  | "MODEL_COMPLETED"
  | "PLAN_VALIDATED"
  | "TOOL_DISPATCHED"
  | "ACTION_ACK"
  | "SAFE_NOOP"
  | "REJECTED";

export interface RuntimeEvent {
  schemaVersion: "0.1";
  sequence: number;
  eventId: string;
  intentId: string;
  type: RuntimeEventType;
  timestamp: string;
  elapsedMs: number;
  source: "cu-agent" | "guardrail" | "du-executor";
  detail: Record<string, unknown>;
}

export type RunStatus = "succeeded" | "safe_timeout" | "rejected";

export interface RunResult {
  intentId: string;
  status: RunStatus;
  elapsedMs: number;
  slaMs: number;
  slaMet: boolean;
  action?: ActionProposal;
  ack?: {
    applied: boolean;
    configVersion: number;
  };
  reason?: string;
  events: RuntimeEvent[];
}
