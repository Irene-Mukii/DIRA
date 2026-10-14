import "server-only";

import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { logAgentEvent } from "@/lib/agent/logger";

export const FETCH_SERVER_VERSION = "2026.10.10";
const FETCH_TOOL = "fetch";

export type FetchMcpErrorCode =
  | "timeout"
  | "access_restricted"
  | "http_error"
  | "response_too_large"
  | "unsupported_content"
  | "content_extraction_failure"
  | "provider_error";

export class FetchMcpError extends Error {
  constructor(
    public readonly code: FetchMcpErrorCode,
    public readonly httpStatus: number | null = null,
  ) {
    super(code);
    this.name = "FetchMcpError";
  }
}

export interface FetchMcpSession {
  transport: FetchMcpTransportMode;
  fetchMarkdown(
    url: string,
    maxLength: number,
    timeoutMs: number,
  ): Promise<{ markdown: string; pageUrl: string }>;
  close(): Promise<void>;
}

export type FetchMcpTransportMode = "stdio" | "http";

export interface FetchMcpConnectionContext {
  runId: string;
  workflow: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTextContent(
  value: unknown,
): value is { type: "text"; text: string } {
  return (
    isRecord(value) && value.type === "text" && typeof value.text === "string"
  );
}

function errorFromToolText(text: string): FetchMcpError {
  const status = Number(
    text.match(
      /(?:status(?:\s+code)?\s*:?\s*|HTTP(?:\s+Error)?\s+)(\d{3})/i,
    )?.[1] ?? text.match(/\b(401|403|404|408|413|429|5\d{2})\b/i)?.[1],
  );
  const httpStatus = Number.isInteger(status) ? status : null;
  if (httpStatus === 401 || httpStatus === 403) {
    return new FetchMcpError("access_restricted", httpStatus);
  }
  if (httpStatus === 408 || httpStatus === 504) {
    return new FetchMcpError("timeout", httpStatus);
  }
  if (httpStatus === 413) {
    return new FetchMcpError("response_too_large", httpStatus);
  }
  if (httpStatus === 415) {
    return new FetchMcpError("unsupported_content", httpStatus);
  }
  if (httpStatus !== null) {
    return new FetchMcpError("http_error", httpStatus);
  }
  if (/timed?\s*out|timeout/i.test(text)) {
    return new FetchMcpError("timeout");
  }
  return new FetchMcpError("provider_error");
}

function transportMode(): FetchMcpTransportMode {
  const configured = process.env.FETCH_MCP_TRANSPORT?.trim() || "stdio";
  if (configured === "stdio" || configured === "http") return configured;
  throw new FetchMcpError("provider_error");
}

function createTransport(mode: FetchMcpTransportMode, correlationId: string) {
  if (mode === "stdio") {
    const executable = process.env.FETCH_MCP_COMMAND?.trim() || "uvx";
    const environment = getDefaultEnvironment();
    if (process.platform === "win32") {
      environment.PYTHONIOENCODING = "utf-8";
    }
    return new StdioClientTransport({
      command: executable,
      args: [
        "--from",
        `mcp-server-fetch==${FETCH_SERVER_VERSION}`,
        "mcp-server-fetch",
      ],
      env: environment,
      stderr: "inherit",
      maxBufferSize: 256 * 1024,
    });
  }

  const endpoint = process.env.FETCH_MCP_URL?.trim();
  const token = process.env.FETCH_MCP_TOKEN?.trim();
  if (!endpoint || !token || token.length < 32 || /\s/.test(token)) {
    throw new FetchMcpError("provider_error");
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new FetchMcpError("provider_error");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new FetchMcpError("provider_error");
  }

  return new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: {
        authorization: `Bearer ${token}`,
        "x-dira-correlation-id": correlationId,
      },
    },
    reconnectionOptions: {
      maxReconnectionDelay: 1_000,
      initialReconnectionDelay: 100,
      reconnectionDelayGrowFactor: 1,
      maxRetries: 0,
    },
  });
}

async function logFetchMcpConnectionEvent(
  context: FetchMcpConnectionContext,
  eventType: "fetch_connection" | "fetch_tool_discovery",
  action: string,
  status: "started" | "success" | "error",
  metadata: Record<string, unknown>,
  error?: string,
  durationMs?: number,
): Promise<void> {
  await logAgentEvent({
    run_id: context.runId,
    workflow: context.workflow,
    event_type: eventType,
    agent_action: action,
    tool_name: "retrieve_education_resources",
    status,
    metadata: {
      correlation_id: context.runId,
      ...metadata,
    },
    ...(error ? { error } : {}),
    ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
  });
}

export async function connectFetchMcp(
  timeoutMs: number,
  context: FetchMcpConnectionContext = {
    runId: randomUUID(),
    workflow: "education_retrieval",
  },
): Promise<FetchMcpSession> {
  const startedAt = Date.now();
  const configuredMode = process.env.FETCH_MCP_TRANSPORT?.trim();
  const mode =
    configuredMode === "stdio" || configuredMode === "http"
      ? configuredMode
      : configuredMode
        ? "invalid"
        : "stdio";
  await logFetchMcpConnectionEvent(
    context,
    "fetch_connection",
    "fetch_connection",
    "started",
    { transport: mode },
  );
  const client = new Client(
    { name: "dira-education-retrieval", version: "1.0.0" },
    { capabilities: {} },
  );
  let connected = false;
  let discoveryStartedAt: number | null = null;

  try {
    const transport = createTransport(transportMode(), context.runId);
    await client.connect(transport, { timeout: timeoutMs });
    connected = true;
    await logFetchMcpConnectionEvent(
      context,
      "fetch_connection",
      "fetch_connection",
      "success",
      { transport: mode },
      undefined,
      Date.now() - startedAt,
    );
    discoveryStartedAt = Date.now();
    await logFetchMcpConnectionEvent(
      context,
      "fetch_tool_discovery",
      "fetch_tool_discovery",
      "started",
      { transport: mode },
    );
    const tools = await client.listTools(undefined, { timeout: timeoutMs });
    const fetchTool = tools.tools.find((tool) => tool.name === FETCH_TOOL);
    if (!fetchTool) {
      throw new FetchMcpError("provider_error");
    }
    await logFetchMcpConnectionEvent(
      context,
      "fetch_tool_discovery",
      "fetch_tool_discovery",
      "success",
      { transport: mode, tool_name: FETCH_TOOL },
      undefined,
      Date.now() - discoveryStartedAt,
    );
  } catch (error) {
    let cleanupError: unknown;
    try {
      await client.close();
    } catch (closeError) {
      cleanupError = closeError;
    }
    const fetchError =
      error instanceof FetchMcpError
        ? error
        : error instanceof Error && /timeout|timed out/i.test(error.message)
          ? new FetchMcpError("timeout")
          : new FetchMcpError("provider_error");
    if (connected && discoveryStartedAt !== null) {
      await logFetchMcpConnectionEvent(
        context,
        "fetch_tool_discovery",
        "fetch_tool_discovery",
        "error",
        { transport: mode },
        fetchError.code,
        Date.now() - discoveryStartedAt,
      );
    } else {
      await logFetchMcpConnectionEvent(
        context,
        "fetch_connection",
        "fetch_connection",
        "error",
        { transport: mode },
        fetchError.code,
        Date.now() - startedAt,
      );
    }
    if (cleanupError) {
      throw new AggregateError(
        [fetchError, cleanupError],
        "Fetch MCP connection failed and cleanup also failed",
      );
    }
    throw fetchError;
  }

  return {
    transport: mode === "http" ? "http" : "stdio",
    async fetchMarkdown(url, maxLength, requestTimeoutMs) {
      let result;
      try {
        result = await client.callTool(
          {
            name: FETCH_TOOL,
            arguments: {
              url,
              max_length: maxLength,
              start_index: 0,
              raw: false,
            },
          },
          undefined,
          { timeout: requestTimeoutMs },
        );
      } catch (error) {
        if (error instanceof FetchMcpError) throw error;
        if (
          error instanceof Error &&
          /timeout|timed out/i.test(error.message)
        ) {
          throw new FetchMcpError("timeout");
        }
        throw new FetchMcpError("provider_error");
      }

      const text = (Array.isArray(result.content) ? result.content : [])
        .filter(isTextContent)
        .map((item) => item.text)
        .join("\n")
        .trim();
      if (result.isError === true) throw errorFromToolText(text);

      if (/Content type .* cannot be simplified to markdown/i.test(text)) {
        throw new FetchMcpError("unsupported_content");
      }
      if (/<error>Content truncated\./i.test(text)) {
        throw new FetchMcpError("response_too_large");
      }

      const header = text.match(/^Contents of (https:\/\/[^\r\n]+):\r?\n/);
      if (!header) throw new FetchMcpError("content_extraction_failure");
      const pageUrl = header[1];
      const markdown = text.slice(header[0].length).trim();
      if (!markdown || /^<error>/i.test(markdown)) {
        throw new FetchMcpError("content_extraction_failure");
      }

      return { markdown, pageUrl };
    },
    async close() {
      await client.close();
    },
  };
}
