import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";

const CLIENT_REQUEST_TIMEOUT_MS = 15_000;

export type McpTool = ListToolsResult["tools"][number];
export type McpToolCallResult = Awaited<ReturnType<Client["callTool"]>>;

export interface McpSession {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args?: Record<string, unknown>): Promise<McpToolCallResult>;
  close(): Promise<void>;
}

export interface ConnectMcpOptions {
  endpoint: string;
  authProvider: OAuthClientProvider;
  timeoutMs?: number;
}

export class McpToolCallError extends Error {
  constructor(toolName: string) {
    super(`MCP tool "${toolName}" returned an error`);
    this.name = "McpToolCallError";
  }
}

function validateMcpEndpoint(endpoint: string): URL {
  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Keeper MCP endpoint must be a valid URL");
  }

  const isLocalHttp =
    process.env.NODE_ENV !== "production" &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");

  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new Error("Keeper MCP endpoint must use HTTPS");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Keeper MCP endpoint must not contain credentials or URL extras");
  }

  return url;
}

export async function connectMcpServer({
  endpoint,
  authProvider,
  timeoutMs = CLIENT_REQUEST_TIMEOUT_MS,
}: ConnectMcpOptions): Promise<McpSession> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("MCP request timeout must be a positive integer");
  }

  const client = new Client(
    { name: "dira", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(
    validateMcpEndpoint(endpoint),
    { authProvider },
  );

  try {
    await client.connect(transport, { timeout: timeoutMs });
  } catch (connectionError) {
    try {
      await client.close();
    } catch (closeError) {
      throw new AggregateError(
        [connectionError, closeError],
        "MCP connection failed and cleanup also failed",
      );
    }

    throw connectionError;
  }

  return {
    async listTools() {
      const result = await client.listTools(undefined, { timeout: timeoutMs });
      return result.tools;
    },
    async callTool(name, args = {}) {
      const result = await client.callTool(
        { name, arguments: args },
        undefined,
        { timeout: timeoutMs },
      );

      if ("isError" in result && result.isError) {
        throw new McpToolCallError(name);
      }

      return result;
    },
    async close() {
      await client.close();
    },
  };
}

export function getKeeperMcpEndpoint(): string {
  const endpoint = process.env.KEEPER_MCP_URL?.trim();
  return endpoint || "https://www.keeper.sh/mcp";
}
