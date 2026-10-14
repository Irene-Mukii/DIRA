import "server-only";

import { logAgentEvent } from "@/lib/agent/logger";

export const DIRA_AGENT_MODEL = "glm-5.3-flash";
const GLM_REQUEST_TIMEOUT_MS = 75_000;

export interface AgentFunctionTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AgentFunctionCall {
  id: string;
  name: string;
  arguments: string;
}

export type AgentMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

export interface AgentCompletion {
  content: string | null;
  toolCalls: AgentFunctionCall[];
  usage: ModelUsage | null;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export interface ModelCallContext {
  runId: string;
  workflow: string;
  attempt?: number;
}

export class GlmConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GlmConfigurationError";
  }
}

export class GlmRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GlmRequestError";
  }
}

function sanitizeDiagnostic(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/(bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_ -]?key|authorization)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 500);
}

function describeRequestError(
  error: unknown,
  depth = 0,
): Record<string, unknown> {
  if (depth > 2) return {};
  if (!(error instanceof Error)) {
    return { errorMessage: sanitizeDiagnostic(String(error)) };
  }

  const details: Record<string, unknown> = {
    errorName: sanitizeDiagnostic(error.name),
    errorMessage: sanitizeDiagnostic(error.message),
  };
  const properties = error as Error & Record<string, unknown>;
  for (const key of ["code", "syscall", "hostname", "port"] as const) {
    const value = properties[key];
    if (typeof value === "string" || typeof value === "number") {
      details[key === "code" ? "errorCode" : key] =
        sanitizeDiagnostic(String(value));
    }
  }
  if (properties.cause !== undefined) {
    details.cause = describeRequestError(properties.cause, depth + 1);
  }
  return details;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTokenCount(value: unknown): number | null {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0
    ? value
    : null;
}

function parseUsage(value: unknown): ModelUsage | null {
  if (!isRecord(value)) return null;
  const inputTokens = readTokenCount(value.prompt_tokens);
  const outputTokens = readTokenCount(value.completion_tokens);
  if (inputTokens === null || outputTokens === null) return null;

  const details = isRecord(value.prompt_tokens_details)
    ? value.prompt_tokens_details
    : null;
  const cachedInputTokens =
    readTokenCount(details?.cached_tokens) ??
    readTokenCount(value.cached_tokens) ??
    0;
  if (cachedInputTokens > inputTokens) return null;

  return { inputTokens, outputTokens, cachedInputTokens };
}

function parseCompletion(value: unknown): AgentCompletion {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    throw new GlmRequestError("GLM returned an invalid completion response");
  }

  const message = value.choices[0];
  if (!isRecord(message) || !isRecord(message.message)) {
    throw new GlmRequestError("GLM returned no assistant message");
  }

  const assistant = message.message;
  const content =
    typeof assistant.content === "string" ? assistant.content : null;
  const rawToolCalls = assistant.tool_calls;
  const toolCalls: AgentFunctionCall[] = [];

  if (rawToolCalls !== undefined) {
    if (!Array.isArray(rawToolCalls)) {
      throw new GlmRequestError("GLM returned invalid tool calls");
    }
    for (const rawCall of rawToolCalls) {
      if (
        !isRecord(rawCall) ||
        typeof rawCall.id !== "string" ||
        !isRecord(rawCall.function) ||
        typeof rawCall.function.name !== "string" ||
        typeof rawCall.function.arguments !== "string"
      ) {
        throw new GlmRequestError("GLM returned a malformed tool call");
      }
      toolCalls.push({
        id: rawCall.id,
        name: rawCall.function.name,
        arguments: rawCall.function.arguments,
      });
    }
  }

  if (!content && toolCalls.length === 0) {
    throw new GlmRequestError("GLM returned neither a reply nor a tool call");
  }

  return { content, toolCalls, usage: parseUsage(value.usage) };
}

async function requestAgentCompletion(
  messages: AgentMessage[],
  tools: AgentFunctionTool[],
): Promise<AgentCompletion> {
  const apiKey = process.env.ZAI_API_KEY?.trim();
  if (!apiKey) {
    throw new GlmConfigurationError("ZAI_API_KEY is not configured");
  }

  const signal = AbortSignal.timeout(GLM_REQUEST_TIMEOUT_MS);
  const requestStartedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(
      "https://api.z.ai/api/paas/v4/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: DIRA_AGENT_MODEL,
          messages,
          reasoning_effort: "low",
          ...(tools.length === 0
            ? { response_format: { type: "json_object" } }
            : {}),
          ...(tools.length > 0
            ? {
                tools: tools.map((tool) => ({
                  type: "function",
                  function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                  },
                })),
                tool_choice: "auto",
              }
            : {}),
          temperature: 0.2,
          stream: false,
        }),
        signal,
      },
    );
  } catch (error) {
    const timedOut =
      signal.aborted ||
      (error instanceof Error && error.name === "TimeoutError");
    console.error("GLM request failed", {
      model: DIRA_AGENT_MODEL,
      duration_ms: Date.now() - requestStartedAt,
      timeout_ms: GLM_REQUEST_TIMEOUT_MS,
      failure_type: timedOut ? "timeout" : "network",
      error: describeRequestError(error),
    });
    throw new GlmRequestError("Could not reach the configured GLM service");
  }

  if (!response.ok) {
    throw new GlmRequestError(
      `GLM service returned HTTP ${response.status}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GlmRequestError("GLM returned a non-JSON response");
  }

  return parseCompletion(body);
}

export async function createAgentCompletion(
  messages: AgentMessage[],
  tools: AgentFunctionTool[],
  context?: ModelCallContext,
): Promise<AgentCompletion> {
  const startedAt = Date.now();
  try {
    const completion = await requestAgentCompletion(messages, tools);
    if (context) {
      await logAgentEvent({
        run_id: context.runId,
        workflow: context.workflow,
        attempt: context.attempt,
        event_type: "model_call",
        agent_action: "model_call",
        tool_name: "glm.chat.completions",
        status: "success",
        provider: "z.ai",
        model: DIRA_AGENT_MODEL,
        usage: completion.usage,
        duration_ms: Date.now() - startedAt,
        metadata: { usage_available: completion.usage !== null },
      });
    }
    return completion;
  } catch (error) {
    if (context) {
      await logAgentEvent({
        run_id: context.runId,
        workflow: context.workflow,
        attempt: context.attempt,
        event_type: "model_call",
        agent_action: "model_call",
        tool_name: "glm.chat.completions",
        status: "error",
        provider: "z.ai",
        model: DIRA_AGENT_MODEL,
        cost_status: "unknown",
        duration_ms: Date.now() - startedAt,
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }
    throw error;
  }
}
