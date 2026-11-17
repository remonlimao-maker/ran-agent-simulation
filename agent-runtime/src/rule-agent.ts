import type { ActionProposal, DecisionContext, DecisionInput, StationDecisionAgent } from "./types.ts";

/** Deterministic lower-bound baseline for every 0.8B experiment. */
export class RuleBasedAgent implements StationDecisionAgent {
  readonly name = "rules-baseline";

  async decide(input: DecisionInput, context: DecisionContext): Promise<ActionProposal> {
    context.signal.throwIfAborted();
    const snapshot = input.snapshots[0];
    const { intent } = input;

    if (intent.objective.metric === "energy_consumption" && intent.objective.direction === "decrease") {
      return {
        actionName: "set_energy_saving_mode",
        target: { gnbId: snapshot.gnbId, cellId: snapshot.cellId },
        parameters: { mode: "LOW_POWER" },
        expectedConfigVersion: snapshot.configVersion,
      };
    }
    if (intent.objective.metric.includes("latency") && intent.objective.direction === "decrease") {
      return {
        actionName: "set_scheduler_profile",
        target: { gnbId: snapshot.gnbId, cellId: snapshot.cellId },
        parameters: { profile: "latency" },
        expectedConfigVersion: snapshot.configVersion,
      };
    }
    return {
      actionName: "set_tx_power_offset",
      target: { gnbId: snapshot.gnbId, cellId: snapshot.cellId },
      parameters: { offsetDb: 0 },
      expectedConfigVersion: snapshot.configVersion,
    };
  }
}
