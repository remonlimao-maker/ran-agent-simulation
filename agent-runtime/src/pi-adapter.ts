import { GuardrailError } from "./errors.ts";
import type {
  ActionName,
  ActionProposal,
  DecisionContext,
  DecisionInput,
  StationDecisionAgent,
  ToolDescriptor,
} from "./types.ts";

/**
 * Narrow boundary for @earendil-works/pi-agent-core.
 *
 * The production adapter should configure Pi for one assistant turn, expose only
 * the supplied tools, disable follow-on planning, and translate Pi's event stream
 * into the runtime event journal. Keeping that dependency behind this interface
 * lets the safety core run and test without a model SDK or network access.
 */
export interface PiOneShotRunner {
  runOneShot(request: {
    system: string;
    input: unknown;
    tools: ToolDescriptor[];
    signal: AbortSignal;
  }): Promise<{
    toolCalls: Array<{
      name: string;
      arguments: Record<string, unknown>;
    }>;
  }>;
}

export class PiStationAgentAdapter implements StationDecisionAgent {
  readonly name = "pi-agent";
  readonly model: string;
  readonly #runner: PiOneShotRunner;

  constructor(runner: PiOneShotRunner, model = "0.8B-int4") {
    this.#runner = runner;
    this.model = model;
  }

  async decide(input: DecisionInput, context: DecisionContext): Promise<ActionProposal> {
    const response = await this.#runner.runOneShot({
      system:
        "Choose exactly one supplied RAN tool. " +
        "If objective.metric is energy_consumption and objective.direction is decrease, mode MUST be LOW_POWER and MUST NOT be ACTIVE. " +
        "If objective.metric is energy_consumption and objective.direction is increase, mode MUST be ACTIVE and MUST NOT be LOW_POWER. " +
        "Never return the current value. Tool arguments must contain exactly the schema keys; never copy metrics or invent parameters. " +
        "Return a tool call only; the deterministic runtime performs all safety checks.",
      input,
      tools: input.tools,
      signal: context.signal,
    });

    if (response.toolCalls.length !== 1) {
      throw new GuardrailError("INVALID_TOOL_CALL_COUNT", "Pi agent must return exactly one tool call");
    }
    const call = response.toolCalls[0];
    const args = call.arguments;
    return {
      actionName: call.name as ActionName,
      target: args.target as ActionProposal["target"],
      parameters: (args.parameters ?? {}) as Record<string, unknown>,
      expectedConfigVersion: args.expectedConfigVersion as number,
    };
  }
}
