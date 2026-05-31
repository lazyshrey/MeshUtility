import type {
  MeshPromptModelCapability,
  MeshPromptModelDefinition,
  MeshPromptProviderDefinition,
  MeshPromptProviderId,
} from "./types";

const chatCapabilities = ["chat", "json", "tools", "streaming"] satisfies readonly MeshPromptModelCapability[];

export const meshPromptProviders = [
  {
    id: "xai",
    label: "xAI Grok",
    authMode: "api-key",
    apiKeyEnvVar: "XAI_API_KEY",
    endpoint: {
      baseUrl: "https://api.x.ai/v1",
      chatPath: "/chat/completions",
      modelsPath: "/models",
    },
    defaultModel: "grok-4.3",
    supportsCustomBaseUrl: true,
    requestFormat: "openai-compatible",
    models: [
      {
        id: "grok-4.3",
        label: "Grok 4.3",
        contextWindow: 131_072,
        capabilities: chatCapabilities,
        defaultFor: ["balanced", "reasoning"],
      },
      {
        id: "grok-4.1-fast",
        label: "Grok 4.1 Fast",
        contextWindow: 131_072,
        capabilities: chatCapabilities,
        defaultFor: ["fast"],
      },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    authMode: "api-key",
    apiKeyEnvVar: "OPENAI_API_KEY",
    endpoint: {
      baseUrl: "https://api.openai.com/v1",
      chatPath: "/chat/completions",
      modelsPath: "/models",
    },
    defaultModel: "gpt-4.1-mini",
    supportsCustomBaseUrl: true,
    requestFormat: "openai-compatible",
    models: [
      {
        id: "gpt-4.1-mini",
        label: "GPT-4.1 Mini",
        contextWindow: 1_047_576,
        capabilities: chatCapabilities,
        defaultFor: ["fast", "balanced"],
      },
      {
        id: "gpt-4.1",
        label: "GPT-4.1",
        contextWindow: 1_047_576,
        capabilities: chatCapabilities,
        defaultFor: ["reasoning"],
      },
      {
        id: "o4-mini",
        label: "o4 Mini",
        contextWindow: 200_000,
        capabilities: ["chat", "json", "tools", "vision", "streaming"],
      },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    authMode: "api-key",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    endpoint: {
      baseUrl: "https://api.anthropic.com/v1",
      chatPath: "/messages",
      modelsPath: "/models",
    },
    defaultModel: "claude-3-5-haiku-latest",
    supportsCustomBaseUrl: true,
    requestFormat: "anthropic",
    models: [
      {
        id: "claude-3-5-haiku-latest",
        label: "Claude 3.5 Haiku",
        contextWindow: 200_000,
        capabilities: chatCapabilities,
        defaultFor: ["fast"],
      },
      {
        id: "claude-sonnet-4-20250514",
        label: "Claude Sonnet 4",
        contextWindow: 200_000,
        capabilities: chatCapabilities,
        defaultFor: ["balanced", "reasoning"],
      },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    authMode: "api-key",
    apiKeyEnvVar: "GEMINI_API_KEY",
    endpoint: {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      chatPath: "/models/{model}:generateContent",
      modelsPath: "/models",
    },
    defaultModel: "gemini-2.0-flash",
    supportsCustomBaseUrl: true,
    requestFormat: "gemini",
    models: [
      {
        id: "gemini-2.0-flash",
        label: "Gemini 2.0 Flash",
        contextWindow: 1_048_576,
        capabilities: ["chat", "json", "vision", "streaming"],
        defaultFor: ["fast", "balanced"],
      },
      {
        id: "gemini-1.5-pro",
        label: "Gemini 1.5 Pro",
        contextWindow: 2_097_152,
        capabilities: ["chat", "json", "vision", "streaming"],
        defaultFor: ["reasoning"],
      },
    ],
  },
  {
    id: "groq",
    label: "Groq",
    authMode: "api-key",
    apiKeyEnvVar: "GROQ_API_KEY",
    endpoint: {
      baseUrl: "https://api.groq.com/openai/v1",
      chatPath: "/chat/completions",
      modelsPath: "/models",
    },
    defaultModel: "llama-3.3-70b-versatile",
    supportsCustomBaseUrl: true,
    requestFormat: "openai-compatible",
    models: [
      {
        id: "llama-3.3-70b-versatile",
        label: "Llama 3.3 70B",
        contextWindow: 131_072,
        capabilities: chatCapabilities,
        defaultFor: ["balanced"],
      },
      {
        id: "llama-3.1-8b-instant",
        label: "Llama 3.1 8B",
        contextWindow: 131_072,
        capabilities: chatCapabilities,
        defaultFor: ["fast"],
      },
      {
        id: "llama-3.1-70b-versatile",
        label: "Llama 3.1 70B",
        contextWindow: 131_072,
        capabilities: chatCapabilities,
      },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    authMode: "api-key",
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    endpoint: {
      baseUrl: "https://openrouter.ai/api/v1",
      chatPath: "/chat/completions",
      modelsPath: "/models",
    },
    defaultModel: "openai/gpt-4.1-mini",
    supportsCustomBaseUrl: true,
    requestFormat: "openai-compatible",
    models: [
      {
        id: "openai/gpt-4.1-mini",
        label: "OpenAI GPT-4.1 Mini",
        contextWindow: 1_047_576,
        capabilities: chatCapabilities,
        defaultFor: ["fast", "balanced"],
      },
      {
        id: "anthropic/claude-sonnet-4",
        label: "Anthropic Claude Sonnet 4",
        contextWindow: 200_000,
        capabilities: chatCapabilities,
        defaultFor: ["reasoning"],
      },
      {
        id: "google/gemini-2.0-flash-001",
        label: "Google Gemini 2.0 Flash",
        contextWindow: 1_048_576,
        capabilities: ["chat", "json", "vision", "streaming"],
      },
    ],
  },

  {
    id: "ollama",
    label: "Ollama",
    authMode: "none",
    endpoint: {
      baseUrl: "http://localhost:11434",
      chatPath: "/api/chat",
      modelsPath: "/api/tags",
    },
    defaultModel: "llama3.1",
    supportsCustomBaseUrl: true,
    requestFormat: "ollama",
    models: [
      {
        id: "llama3.1",
        label: "Llama 3.1",
        contextWindow: 131_072,
        capabilities: ["chat", "json", "streaming", "local"],
        defaultFor: ["local", "balanced"],
      },
      {
        id: "mistral",
        label: "Mistral",
        contextWindow: 32_768,
        capabilities: ["chat", "json", "streaming", "local"],
        defaultFor: ["fast"],
      },
      {
        id: "qwen2.5-coder",
        label: "Qwen 2.5 Coder",
        contextWindow: 32_768,
        capabilities: ["chat", "json", "streaming", "local"],
        defaultFor: ["reasoning"],
      },
    ],
  },
] as const satisfies readonly MeshPromptProviderDefinition[];

export const meshPromptProviderIds = meshPromptProviders.map((provider) => provider.id);

export function getMeshPromptProvider(providerId: MeshPromptProviderId): MeshPromptProviderDefinition {
  const provider = meshPromptProviders.find((entry) => entry.id === providerId);

  if (!provider) {
    throw new Error(`Unsupported MeshPrompt provider: ${providerId}`);
  }

  return provider;
}

export function isMeshPromptProviderId(value: string): value is MeshPromptProviderId {
  return meshPromptProviderIds.includes(value as MeshPromptProviderId);
}

export function getMeshPromptModel(
  providerId: MeshPromptProviderId,
  modelId?: string,
): MeshPromptModelDefinition {
  const provider = getMeshPromptProvider(providerId);
  const resolvedModelId = modelId ?? provider.defaultModel;
  const model = provider.models.find((entry) => entry.id === resolvedModelId);

  if (!model) {
    return {
      id: resolvedModelId,
      label: resolvedModelId,
      contextWindow: 0,
      capabilities: ["chat"],
    };
  }

  return model;
}

export function listMeshPromptModels(providerId: MeshPromptProviderId): readonly MeshPromptModelDefinition[] {
  return getMeshPromptProvider(providerId).models;
}
