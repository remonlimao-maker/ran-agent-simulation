import { createModels, createProvider, type Model } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import { PiAgentOneShotRunner, type PiAuditEvent } from "./pi-runner.ts";

export interface LocalPiOptions {
  baseUrl?: string;
  modelId?: string;
  apiKey?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  onEvent?: (event: PiAuditEvent) => void;
}

/** Connect Pi Agent Core to llama.cpp, vLLM, Ollama, or another OpenAI-compatible endpoint. */
export function createLocalPiRunner(options: LocalPiOptions = {}): PiAgentOneShotRunner {
  const baseUrl = options.baseUrl ?? process.env.RAN_MODEL_BASE_URL ?? "http://127.0.0.1:8000/v1";
  const modelId = options.modelId ?? process.env.RAN_MODEL_ID ?? "Qwen/Qwen3-0.6B";
  const apiKey = options.apiKey ?? process.env.RAN_MODEL_API_KEY;

  const model: Model<"openai-completions"> = {
    id: modelId,
    name: `${modelId} (local RAN policy model)`,
    api: "openai-completions",
    provider: "ran-local",
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: options.contextWindow ?? 4_096,
    maxTokens: options.maxOutputTokens ?? 32,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  };

  const provider = createProvider({
    id: "ran-local",
    name: "RAN local inference",
    baseUrl,
    auth: {
      apiKey: {
        name: "Local inference key",
        resolve: async () => ({ auth: apiKey ? { apiKey } : {} }),
      },
    },
    models: [model],
    api: openAICompletionsApi(),
  });
  const models = createModels();
  models.setProvider(provider);

  return new PiAgentOneShotRunner({
    model,
    streamFn: models.streamSimple.bind(models),
    onEvent: options.onEvent,
  });
}
