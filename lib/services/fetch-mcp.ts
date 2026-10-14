import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";

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
  fetchMarkdown(
    url: string,
    maxLength: number,
    timeoutMs: number,
  ): Promise<{ markdown: string; pageUrl: string }>;
  close(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTextContent(value: unknown): value is { type: "text"; text: string } {
  return (
    isRecord(value) &&
    value.type === "text" &&
    typeof value.text === "string"
  );
}

function errorFromToolText(text: string): FetchMcpError {
  const status = Number(
    text.match(/(?:status(?:\s+code)?\s*:?\s*|HTTP(?:\s+Error)?\s+)(\d{3})/i)?.[1] ??
      text.match(/\b(401|403|404|408|413|429|5\d{2})\b/i)?.[1],
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

export async function connectFetchMcp(
  timeoutMs: number,
): Promise<FetchMcpSession> {
  const executable = process.env.FETCH_MCP_COMMAND?.trim() || "uvx";
  const environment = getDefaultEnvironment();
  if (process.platform === "win32") {
    environment.PYTHONIOENCODING = "utf-8";
  }
  const transport = new StdioClientTransport({
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
  const client = new Client(
    { name: "dira-education-retrieval", version: "1.0.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport, { timeout: timeoutMs });
    const tools = await client.listTools(undefined, { timeout: timeoutMs });
    const fetchTool = tools.tools.find((tool) => tool.name === FETCH_TOOL);
    if (!fetchTool) {
      throw new FetchMcpError("provider_error");
    }
  } catch (error) {
    try {
      await client.close();
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        "Fetch MCP connection failed and cleanup also failed",
      );
    }
    if (error instanceof FetchMcpError) throw error;
    if (error instanceof Error && /timeout|timed out/i.test(error.message)) {
      throw new FetchMcpError("timeout");
    }
    throw new FetchMcpError("provider_error");
  }

  return {
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
        if (error instanceof Error && /timeout|timed out/i.test(error.message)) {
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
