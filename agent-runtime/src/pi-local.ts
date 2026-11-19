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
  onPayload?: (payload: unknown) => unknown | undefined | Promise<unknown | undefined>;
  onProviderStreamEvent?: (data: unknown) => void | Promise<void>;
}

/** Connect Pi Agent Core to llama.cpp, vLLM, Ollama, or another OpenAI-compatible endpoint. */
export function createLocalPiRunner(options: LocalPiOptions = {}): PiAgentOneShotRunner {
  const baseUrl = options.baseUrl ?? process.env.RAN_MODEL_BASE_URL ?? "http://127.0.0.1:11434/v1";
  const modelId = options.modelId ?? process.env.RAN_MODEL_ID ?? "qwen3:0.6b";
  const apiKey = options.apiKey ?? process.env.RAN_MODEL_API_KEY ?? (isLoopbackUrl(baseUrl) ? "ollama" : undefined);

  const model: Model<"openai-completions"> = {
    id: modelId,
    name: `${modelId} (local RAN policy model)`,
    api: "openai-completions",
    provider: "ran-local",
    baseUrl,
    reasoning: true,
    thinkingLevelMap: { off: "none" },
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    // Pi reserves 4K safety tokens when a positive context is declared. That
    // would reduce this model's real 4K Ollama context to one output token, so
    // leave clamping disabled here; the runtime already bounds the request.
    contextWindow: options.contextWindow ?? 0,
    maxTokens: options.maxOutputTokens ?? 64,
    samplingParams: { temperature: 0 },
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      maxTokensField: "max_tokens",
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
    onPayload: options.onPayload,
    onProviderStreamEvent: options.onProviderStreamEvent,
  });
}

function isLoopbackUrl(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname;
    return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}
