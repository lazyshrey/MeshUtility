import { invoke } from "@tauri-apps/api/core";
import { getMeshPromptProvider } from "./catalog";
import type {
  MeshPromptClientOptions,
  MeshPromptFinishReason,
  MeshPromptGenerateRequest,
  MeshPromptGenerateResponse,
  MeshPromptMessage,
  MeshPromptMessagePart,
  MeshPromptProviderDefinition,
  MeshPromptProviderErrorCode,
  MeshPromptProviderId,
  MeshPromptTokenUsage,
  MeshPromptToolCall,
} from "./types";
import { MeshPromptProviderError } from "./types";

type JsonObject = Record<string, unknown>;

interface OpenAiChoice {
  readonly message?: {
    readonly content?: string | null;
    readonly tool_calls?: readonly {
      readonly id?: string;
      readonly function?: {
        readonly name?: string;
        readonly arguments?: string;
      };
    }[];
  };
  readonly finish_reason?: string | null;
}

interface OpenAiResponse {
  readonly model?: string;
  readonly choices?: readonly OpenAiChoice[];
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
}

interface AnthropicResponse {
  readonly model?: string;
  readonly content?: readonly {
    readonly type?: string;
    readonly text?: string;
    readonly id?: string;
    readonly name?: string;
    readonly input?: unknown;
  }[];
  readonly stop_reason?: string | null;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
  };
}

interface GeminiResponse {
  readonly candidates?: readonly {
    readonly content?: {
      readonly parts?: readonly {
        readonly text?: string;
      }[];
    };
    readonly finishReason?: string;
  }[];
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
    readonly totalTokenCount?: number;
  };
}

interface OllamaResponse {
  readonly model?: string;
  readonly message?: {
    readonly content?: string;
  };
  readonly done_reason?: string;
  readonly prompt_eval_count?: number;
  readonly eval_count?: number;
}

export class MeshPromptClient {
  private readonly provider: MeshPromptProviderDefinition;
  private readonly credentials: MeshPromptClientOptions["credentials"];
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly appName?: string;
  private readonly appUrl?: string;

  constructor(options: MeshPromptClientOptions) {
    this.provider =
      typeof options.provider === "string" ? getMeshPromptProvider(options.provider) : options.provider;
    this.credentials = options.credentials;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.appName = options.appName;
    this.appUrl = options.appUrl;

    if (!this.fetchImpl) {
      throw new MeshPromptProviderError("No fetch implementation is available.", {
        provider: this.provider.id,
        code: "network_error",
      });
    }
  }

  async generate(request: MeshPromptGenerateRequest): Promise<MeshPromptGenerateResponse> {
    const model = request.model ?? this.provider.defaultModel;

    const endpoint = this.resolveEndpoint(model);
    const body = this.buildRequestBody(request, model);
    const response = await this.postJson(endpoint, body);

    switch (this.provider.requestFormat) {
      case "anthropic":
        return normalizeAnthropicResponse(this.provider.id, model, response);
      case "gemini":
        return normalizeGeminiResponse(this.provider.id, model, response);
      case "ollama":
        return normalizeOllamaResponse(this.provider.id, model, response);
      case "openai-compatible":
      case "xai":
        return normalizeOpenAiResponse(this.provider.id, model, response);
    }
  }

  private resolveEndpoint(model: string): string {
    const baseUrl = stripTrailingSlash(this.credentials?.baseUrl ?? this.provider.endpoint.baseUrl);
    const chatPath = this.provider.endpoint.chatPath.replace("{model}", encodeURIComponent(model));
    return `${baseUrl}${chatPath.startsWith("/") ? chatPath : `/${chatPath}`}`;
  }

  private buildRequestBody(request: MeshPromptGenerateRequest, model: string): JsonObject {
    switch (this.provider.requestFormat) {
      case "anthropic":
        return buildAnthropicRequest(request, model);
      case "gemini":
        return buildGeminiRequest(request);
      case "ollama":
        return buildOllamaRequest(request, model);
      case "openai-compatible":
      case "xai":
        return buildOpenAiCompatibleRequest(request, model);
    }
  }

  private async postJson(url: string, body: JsonObject): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let responseText: string;
      let responseStatus: number;
      let ok: boolean;

      if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
        try {
          const [status, text] = await invoke<[number, string]>("proxy_request", {
            url,
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
          });
          responseStatus = status;
          responseText = text;
          ok = status >= 200 && status < 300;
        } catch (proxyError) {
          try {
            const response = await this.fetchImpl(url, {
              method: "POST",
              headers: this.buildHeaders(),
              body: JSON.stringify(body),
              signal: controller.signal,
            });
            responseStatus = response.status;
            responseText = await response.text();
            ok = response.ok;
          } catch {
            throw proxyError;
          }
        }
      } else {
        const response = await this.fetchImpl(url, {
          method: "POST",
          headers: this.buildHeaders(),
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        responseStatus = response.status;
        responseText = await response.text();
        ok = response.ok;
      }

      if (!ok) {
        const providerMessage = extractProviderMessage(responseText);
        const code = classifyHttpError(responseStatus, providerMessage);
        throw new MeshPromptProviderError(formatProviderFailure(this.provider.label, code, responseStatus, providerMessage), {
          provider: this.provider.id,
          code,
          status: responseStatus,
          responseBody: responseText,
          providerMessage,
        });
      }

      try {
        return responseText.length > 0 ? (JSON.parse(responseText) as unknown) : {};
      } catch (error) {
        throw new MeshPromptProviderError(`${this.provider.label} returned invalid JSON.`, {
          provider: this.provider.id,
          code: "invalid_response",
          status: responseStatus,
          responseBody: responseText,
          cause: error,
        });
      }
    } catch (error) {
      if (error instanceof MeshPromptProviderError) {
        throw error;
      }

      const code = error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network_error";
      throw new MeshPromptProviderError(
        code === "timeout"
          ? `${this.provider.label} request timed out. Increase the timeout or try again.`
          : `${this.provider.label} network request failed. Check your internet connection or base URL.`,
        {
        provider: this.provider.id,
        code,
        cause: error,
        },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.credentials?.headers,
    };

    if (this.provider.id === "anthropic") {
      headers["anthropic-version"] = "2023-06-01";
      if (this.credentials?.apiKey) {
        headers["x-api-key"] = this.credentials.apiKey.trim();
      }
    } else if (this.provider.authMode === "api-key" && this.credentials?.apiKey) {
      headers.Authorization = `Bearer ${this.credentials.apiKey.trim()}`;
    }

    if (this.provider.id === "openrouter") {
      if (this.appName) {
        headers["X-Title"] = this.appName;
      }

      if (this.appUrl) {
        headers["HTTP-Referer"] = this.appUrl;
      }
    }

    return headers;
  }
}

export function createMeshPromptClient(options: MeshPromptClientOptions): MeshPromptClient {
  return new MeshPromptClient(options);
}

function buildOpenAiCompatibleRequest(request: MeshPromptGenerateRequest, model: string): JsonObject {
  return removeUndefined({
    model,
    messages: request.messages.map(toOpenAiMessage),
    temperature: request.temperature,
    top_p: request.topP,
    max_tokens: request.maxOutputTokens,
    stop: request.stop,
    response_format: request.responseFormat === "json" ? { type: "json_object" } : undefined,
    tools: request.tools,
    tool_choice: request.toolChoice,
    metadata: request.metadata,
  });
}

function buildAnthropicRequest(request: MeshPromptGenerateRequest, model: string): JsonObject {
  const system = request.messages
    .filter((message) => message.role === "system")
    .map((message) => contentToText(message.content))
    .join("\n\n");
  const messages = request.messages.filter((message) => message.role !== "system").map(toAnthropicMessage);

  return removeUndefined({
    model,
    system: system.length > 0 ? system : undefined,
    messages,
    max_tokens: request.maxOutputTokens ?? 4096,
    temperature: request.temperature,
    top_p: request.topP,
    stop_sequences: request.stop,
    tools: request.tools?.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    })),
    tool_choice:
      request.toolChoice && request.toolChoice !== "auto" && request.toolChoice !== "none"
        ? { type: "tool", name: request.toolChoice }
        : request.toolChoice
          ? { type: request.toolChoice }
          : undefined,
    metadata: request.metadata ? { user_id: request.metadata.userId } : undefined,
  });
}

function buildGeminiRequest(request: MeshPromptGenerateRequest): JsonObject {
  const systemInstruction = request.messages.find((message) => message.role === "system");
  const contents = request.messages.filter((message) => message.role !== "system").map(toGeminiContent);

  return removeUndefined({
    systemInstruction: systemInstruction
      ? {
          parts: [{ text: contentToText(systemInstruction.content) }],
        }
      : undefined,
    contents,
    generationConfig: removeUndefined({
      temperature: request.temperature,
      topP: request.topP,
      maxOutputTokens: request.maxOutputTokens,
      stopSequences: request.stop,
      responseMimeType: request.responseFormat === "json" ? "application/json" : undefined,
    }),
    tools: request.tools
      ? [
          {
            functionDeclarations: request.tools.map((tool) => ({
              name: tool.function.name,
              description: tool.function.description,
              parameters: tool.function.parameters,
            })),
          },
        ]
      : undefined,
  });
}

function buildOllamaRequest(request: MeshPromptGenerateRequest, model: string): JsonObject {
  return removeUndefined({
    model,
    messages: request.messages.map((message) => ({
      role: message.role === "tool" ? "user" : message.role,
      content: contentToText(message.content),
    })),
    stream: false,
    format: request.responseFormat === "json" ? "json" : undefined,
    options: removeUndefined({
      temperature: request.temperature,
      top_p: request.topP,
      num_predict: request.maxOutputTokens,
      stop: request.stop,
    }),
  });
}

function toOpenAiMessage(message: MeshPromptMessage): JsonObject {
  return removeUndefined({
    role: message.role,
    content:
      typeof message.content === "string"
        ? message.content
        : message.content.map((part) =>
            part.type === "text"
              ? { type: "text", text: part.text }
              : {
                  type: "image_url",
                  image_url: { url: `data:${part.mimeType};base64,${part.data}` },
                },
          ),
    name: message.name,
    tool_call_id: message.toolCallId,
  });
}

function toAnthropicMessage(message: MeshPromptMessage): JsonObject {
  return {
    role: message.role === "assistant" ? "assistant" : "user",
    content:
      typeof message.content === "string"
        ? message.content
        : message.content.map((part) =>
            part.type === "text"
              ? { type: "text", text: part.text }
              : {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: part.mimeType,
                    data: part.data,
                  },
                },
          ),
  };
}

function toGeminiContent(message: MeshPromptMessage): JsonObject {
  return {
    role: message.role === "assistant" ? "model" : "user",
    parts:
      typeof message.content === "string"
        ? [{ text: message.content }]
        : message.content.map((part) =>
            part.type === "text"
              ? { text: part.text }
              : {
                  inlineData: {
                    mimeType: part.mimeType,
                    data: part.data,
                  },
                },
          ),
  };
}

function normalizeOpenAiResponse(
  provider: MeshPromptProviderId,
  fallbackModel: string,
  raw: unknown,
): MeshPromptGenerateResponse {
  const response = raw as OpenAiResponse;
  const choice = response.choices?.[0];

  return {
    provider,
    model: response.model ?? fallbackModel,
    content: choice?.message?.content ?? "",
    finishReason: normalizeFinishReason(choice?.finish_reason),
    usage: normalizeUsage(
      response.usage?.prompt_tokens,
      response.usage?.completion_tokens,
      response.usage?.total_tokens,
    ),
    toolCalls: choice?.message?.tool_calls?.map((toolCall) => ({
      id: toolCall.id ?? "",
      name: toolCall.function?.name ?? "",
      argumentsJson: toolCall.function?.arguments ?? "{}",
    })),
    raw,
  };
}

function normalizeAnthropicResponse(
  provider: MeshPromptProviderId,
  fallbackModel: string,
  raw: unknown,
): MeshPromptGenerateResponse {
  const response = raw as AnthropicResponse;
  const text = response.content
    ?.filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
  const toolCalls = response.content
    ?.filter((part) => part.type === "tool_use")
    .map((part) => ({
      id: part.id ?? "",
      name: part.name ?? "",
      argumentsJson: JSON.stringify(part.input ?? {}),
    }));

  return {
    provider,
    model: response.model ?? fallbackModel,
    content: text ?? "",
    finishReason: normalizeFinishReason(response.stop_reason),
    usage: normalizeUsage(response.usage?.input_tokens, response.usage?.output_tokens),
    toolCalls,
    raw,
  };
}

function normalizeGeminiResponse(
  provider: MeshPromptProviderId,
  fallbackModel: string,
  raw: unknown,
): MeshPromptGenerateResponse {
  const response = raw as GeminiResponse;
  const candidate = response.candidates?.[0];
  const content = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

  return {
    provider,
    model: fallbackModel,
    content,
    finishReason: normalizeFinishReason(candidate?.finishReason),
    usage: normalizeUsage(
      response.usageMetadata?.promptTokenCount,
      response.usageMetadata?.candidatesTokenCount,
      response.usageMetadata?.totalTokenCount,
    ),
    raw,
  };
}

function normalizeOllamaResponse(
  provider: MeshPromptProviderId,
  fallbackModel: string,
  raw: unknown,
): MeshPromptGenerateResponse {
  const response = raw as OllamaResponse;

  return {
    provider,
    model: response.model ?? fallbackModel,
    content: response.message?.content ?? "",
    finishReason: normalizeFinishReason(response.done_reason),
    usage: normalizeUsage(response.prompt_eval_count, response.eval_count),
    raw,
  };
}

function normalizeUsage(
  inputTokens?: number,
  outputTokens?: number,
  totalTokens?: number,
): MeshPromptTokenUsage | undefined {
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  const input = inputTokens ?? 0;
  const output = outputTokens ?? 0;

  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: totalTokens ?? input + output,
  };
}

function normalizeFinishReason(reason?: string | null): MeshPromptFinishReason {
  switch (reason?.toLowerCase()) {
    case "stop":
    case "end_turn":
      return "stop";
    case "length":
    case "max_tokens":
      return "length";
    case "tool_calls":
    case "tool_use":
      return "tool-call";
    case "content_filter":
    case "safety":
      return "content-filter";
    default:
      return "unknown";
  }
}

function contentToText(content: MeshPromptMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  return content.map(partToText).join("");
}

function partToText(part: MeshPromptMessagePart): string {
  return part.type === "text" ? part.text : `[image:${part.mimeType}]`;
}

function removeUndefined<T extends JsonObject>(value: T): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function extractProviderMessage(responseText: string): string | undefined {
  if (!responseText.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(responseText) as {
      error?: { message?: string; code?: string; type?: string; param?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === "string") {
      return parsed.error;
    }
    return parsed.error?.message ?? parsed.message;
  } catch {
    return responseText.slice(0, 240);
  }
}

function classifyHttpError(status: number, providerMessage?: string): MeshPromptProviderErrorCode {
  const text = providerMessage?.toLowerCase() ?? "";
  if (status === 401 || status === 403) {
    return "invalid_key";
  }
  if (status === 404 || text.includes("model") || text.includes("not found")) {
    return "invalid_model";
  }
  if (status === 408 || status === 504) {
    return "timeout";
  }
  if (status === 429) {
    return "rate_limited";
  }
  return "provider_error";
}

function formatProviderFailure(
  providerLabel: string,
  code: MeshPromptProviderErrorCode,
  status: number,
  providerMessage?: string,
): string {
  const detail = providerMessage ? ` ${providerMessage}` : "";
  switch (code) {
    case "invalid_key":
      return `${providerLabel} rejected the API key.${detail}`;
    case "invalid_model":
      return `${providerLabel} could not use this model.${detail}`;
    case "rate_limited":
      return `${providerLabel} rate limit reached. Try again later.${detail}`;
    case "timeout":
      return `${providerLabel} request timed out.${detail}`;
    default:
      return `${providerLabel} returned HTTP ${status}.${detail}`;
  }
}
