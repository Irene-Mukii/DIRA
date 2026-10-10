import "server-only";

export const DIRA_AGENT_MODEL = "glm-5.3";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  return { content, toolCalls };
}

export async function createAgentCompletion(
  messages: AgentMessage[],
  tools: AgentFunctionTool[],
): Promise<AgentCompletion> {
  const apiKey = process.env.ZAI_API_KEY?.trim();
  if (!apiKey) {
    throw new GlmConfigurationError("ZAI_API_KEY is not configured");
  }

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
        signal: AbortSignal.timeout(25_000),
      },
    );
  } catch {
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
