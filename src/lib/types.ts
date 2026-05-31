export type MeshPromptProviderId =
  | "xai"
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "ollama"
  | "groq";

export type MeshPromptModelCapability =
  | "chat"
  | "json"
  | "tools"
  | "vision"
  | "streaming"
  | "local";

export type MeshPromptProviderAuthMode = "api-key" | "none";

export type MeshPromptRole = "system" | "user" | "assistant" | "tool";

export type MeshPromptFinishReason =
  | "stop"
  | "length"
  | "tool-call"
  | "content-filter"
  | "unknown";

export interface MeshPromptProviderEndpoint {
  readonly baseUrl: string;
  readonly chatPath: string;
  readonly modelsPath?: string;
}

export interface MeshPromptModelDefinition {
  readonly id: string;
  readonly label: string;
  readonly contextWindow: number;
  readonly outputLimit?: number;
  readonly capabilities: readonly MeshPromptModelCapability[];
  readonly defaultFor?: readonly ("fast" | "balanced" | "reasoning" | "local")[];
}

export interface MeshPromptProviderDefinition {
  readonly id: MeshPromptProviderId;
  readonly label: string;
  readonly authMode: MeshPromptProviderAuthMode;
  readonly apiKeyEnvVar?: string;
  readonly endpoint: MeshPromptProviderEndpoint;
  readonly models: readonly MeshPromptModelDefinition[];
  readonly defaultModel: string;
  readonly supportsCustomBaseUrl: boolean;
  readonly requestFormat: "openai-compatible" | "anthropic" | "gemini" | "ollama" | "xai";
}

export interface MeshPromptTextPart {
  readonly type: "text";
  readonly text: string;
}

export interface MeshPromptImagePart {
  readonly type: "image";
  readonly mimeType: string;
  readonly data: string;
}

export type MeshPromptMessagePart = MeshPromptTextPart | MeshPromptImagePart;

export interface MeshPromptMessage {
  readonly role: MeshPromptRole;
  readonly content: string | readonly MeshPromptMessagePart[];
  readonly name?: string;
  readonly toolCallId?: string;
}

export interface MeshPromptToolParameterSchema {
  readonly type: "object";
  readonly properties: Record<string, unknown>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

export interface MeshPromptToolDefinition {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: MeshPromptToolParameterSchema;
  };
}

export interface MeshPromptGenerateOptions {
  readonly model?: string;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  readonly stop?: readonly string[];
  readonly responseFormat?: "text" | "json";
  readonly tools?: readonly MeshPromptToolDefinition[];
  readonly toolChoice?: "auto" | "none" | string;
  readonly metadata?: Record<string, string>;
}

export interface MeshPromptGenerateRequest extends MeshPromptGenerateOptions {
  readonly messages: readonly MeshPromptMessage[];
}

export interface MeshPromptTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface MeshPromptToolCall {
  readonly id: string;
  readonly name: string;
  readonly argumentsJson: string;
}

export interface MeshPromptGenerateResponse {
  readonly provider: MeshPromptProviderId;
  readonly model: string;
  readonly content: string;
  readonly finishReason: MeshPromptFinishReason;
  readonly usage?: MeshPromptTokenUsage;
  readonly toolCalls?: readonly MeshPromptToolCall[];
  readonly raw: unknown;
}

export type MeshPromptProviderErrorCode =
  | "invalid_key"
  | "invalid_model"
  | "network_error"
  | "timeout"
  | "rate_limited"
  | "provider_error"
  | "invalid_response"
  | "unknown_error";

export interface MeshPromptProviderCredentials {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly headers?: Record<string, string>;
}

export interface MeshPromptClientOptions {
  readonly provider: MeshPromptProviderId | MeshPromptProviderDefinition;
  readonly credentials?: MeshPromptProviderCredentials;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly appName?: string;
  readonly appUrl?: string;
}

export class MeshPromptProviderError extends Error {
  readonly provider: MeshPromptProviderId;
  readonly code: MeshPromptProviderErrorCode;
  readonly status?: number;
  readonly responseBody?: string;
  readonly providerMessage?: string;
  readonly cause?: unknown;

  constructor(
    message: string,
    options: {
      readonly provider: MeshPromptProviderId;
      readonly code?: MeshPromptProviderErrorCode;
      readonly status?: number;
      readonly responseBody?: string;
      readonly providerMessage?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message);
    this.name = "MeshPromptProviderError";
    this.cause = options.cause;
    this.provider = options.provider;
    this.code = options.code ?? "unknown_error";
    this.status = options.status;
    this.responseBody = options.responseBody;
    this.providerMessage = options.providerMessage;
  }
}

export interface MeshPromptActionInputSpec {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly required: boolean;
  readonly multiline?: boolean;
  readonly defaultValue?: string;
}

export interface MeshPromptActionExecutionContext {
  readonly selectedText?: string;
  readonly documentText?: string;
  readonly userInstruction?: string;
  readonly variables?: Record<string, string>;
  readonly settings?: any; // or pass specific settings
}

export interface MeshPromptActionBuildResult {
  readonly messages: readonly MeshPromptMessage[];
  readonly options?: MeshPromptGenerateOptions;
}

export interface MeshPromptActionDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly category: "write" | "edit" | "analyze" | "transform" | "custom";
  readonly inputs: readonly MeshPromptActionInputSpec[];
  readonly build: (context: MeshPromptActionExecutionContext) => MeshPromptActionBuildResult;
}

export interface MeshPromptCustomActionDefinition {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly systemPrompt?: string;
  readonly userPromptTemplate: string;
  readonly category?: MeshPromptActionDefinition["category"];
  readonly inputs?: readonly MeshPromptActionInputSpec[];
  readonly options?: MeshPromptGenerateOptions;
}
