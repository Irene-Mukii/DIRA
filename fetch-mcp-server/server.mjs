import { timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export const FETCH_SERVER_VERSION = "2026.10.10";
const FETCH_TOOL_NAME = "fetch";
const MAX_REQUEST_BODY_BYTES = 64 * 1024;
const MAX_FETCH_LENGTH = 128_000;
const MAX_CONCURRENT_FETCHES = 8;
const FETCH_TIMEOUT_MS = 30_000;
const CORRELATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_DOMAINS = [
  "ibo.org",
  "educationendowmentfoundation.org.uk",
  "montessori-ami.org",
  "ies.ed.gov",
];

function logEvent(event, fields = {}) {
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "dira-fetch-mcp",
      event,
      ...fields,
    }),
  );
}

function bearerMatches(request, expectedToken) {
  const match = request.headers.authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(expectedToken);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

function correlationIdFrom(request) {
  const value = request.headers["x-dira-correlation-id"];
  return typeof value === "string" && CORRELATION_ID_PATTERN.test(value)
    ? value
    : "unavailable";
}

function validatedFetchArguments(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const args = value;
  if (typeof args.url !== "string") return false;
  let url;
  try {
    url = new URL(args.url);
  } catch {
    return false;
  }
  const allowedHost = ALLOWED_DOMAINS.some(
    (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
  );
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    allowedHost &&
    Number.isInteger(args.max_length) &&
    args.max_length >= 1 &&
    args.max_length <= MAX_FETCH_LENGTH &&
    args.start_index === 0 &&
    args.raw === false
  );
}

function readBoundedJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BODY_BYTES) tooLarge = true;
      else if (!tooLarge) chunks.push(chunk);
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(
          Object.assign(new Error("Request body too large"), { status: 413 }),
        );
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function jsonResponse(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function createDownstreamServer(fetchTool, upstreamClient, getInFlightCount) {
  const server = new Server(
    { name: "dira-fetch-mcp", version: FETCH_SERVER_VERSION },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [fetchTool],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (
      request.params.name !== FETCH_TOOL_NAME ||
      !validatedFetchArguments(request.params.arguments)
    ) {
      return {
        content: [{ type: "text", text: "Invalid Fetch MCP request" }],
        isError: true,
      };
    }
    if (getInFlightCount() >= MAX_CONCURRENT_FETCHES) {
      return {
        content: [{ type: "text", text: "Fetch MCP is at capacity" }],
        isError: true,
      };
    }
    return upstreamClient.callTool(
      {
        name: FETCH_TOOL_NAME,
        arguments: request.params.arguments,
      },
      undefined,
      { timeout: FETCH_TIMEOUT_MS },
    );
  });
  return server;
}

export function createFetchHttpServer({
  token,
  upstreamClient,
  fetchTool,
  host = "0.0.0.0",
  port = 10_000,
}) {
  if (typeof token !== "string" || token.length < 32 || /\s/.test(token)) {
    throw new Error(
      "FETCH_MCP_AUTH_TOKEN must be at least 32 non-whitespace characters",
    );
  }
  if (!fetchTool || fetchTool.name !== FETCH_TOOL_NAME) {
    throw new Error("The upstream Fetch MCP server did not advertise fetch");
  }

  let inFlightFetches = 0;
  const server = createHttpServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && requestUrl.pathname === "/health") {
      return jsonResponse(response, 200, { status: "ok" });
    }
    if (requestUrl.pathname !== "/mcp") {
      return jsonResponse(response, 404, { error: "Not found" });
    }
    if (!bearerMatches(request, token)) {
      logEvent("request_rejected", { reason: "unauthorized" });
      return jsonResponse(response, 401, { error: "Unauthorized" });
    }
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" });
      return response.end();
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      return jsonResponse(response, 415, { error: "Unsupported content type" });
    }
    const correlationId = correlationIdFrom(request);
    let parsedBody;
    try {
      parsedBody = await readBoundedJson(request);
    } catch (error) {
      if (!response.destroyed) {
        jsonResponse(response, error.status ?? 400, {
          error: "Invalid request",
        });
      }
      return;
    }

    const downstreamServer = createDownstreamServer(
      fetchTool,
      {
        async callTool(...args) {
          inFlightFetches += 1;
          const startedAt = Date.now();
          logEvent("tool_invocation", {
            correlation_id: correlationId,
            tool_name: FETCH_TOOL_NAME,
            status: "started",
          });
          try {
            const result = await upstreamClient.callTool(...args);
            logEvent("tool_invocation", {
              correlation_id: correlationId,
              tool_name: FETCH_TOOL_NAME,
              status: result.isError ? "error" : "success",
              duration_ms: Date.now() - startedAt,
              ...(result.isError ? { error_code: "provider_error" } : {}),
            });
            return result;
          } catch {
            logEvent("tool_invocation", {
              correlation_id: correlationId,
              tool_name: FETCH_TOOL_NAME,
              status: "error",
              error_code: "provider_error",
              duration_ms: Date.now() - startedAt,
            });
            return {
              content: [{ type: "text", text: "Fetch MCP provider error" }],
              isError: true,
            };
          } finally {
            inFlightFetches -= 1;
          }
        },
      },
      () => inFlightFetches,
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
    });
    response.once("close", () => {
      void transport.close();
      void downstreamServer.close();
    });
    try {
      await downstreamServer.connect(transport);
      await transport.handleRequest(request, response, parsedBody);
      if (parsedBody?.method === "tools/list") {
        logEvent("tool_discovery", {
          correlation_id: correlationId,
          tool_name: FETCH_TOOL_NAME,
          status: "success",
        });
      }
    } catch {
      logEvent("request_failed", {
        correlation_id: correlationId,
        error_code: "provider_error",
      });
      if (!response.headersSent) {
        jsonResponse(response, 500, { error: "Fetch MCP request failed" });
      }
      void transport.close();
      void downstreamServer.close();
    }
  });

  server.requestTimeout = 35_000;
  server.headersTimeout = 10_000;
  return {
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve(server.address());
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function start() {
  const command = process.env.FETCH_MCP_COMMAND?.trim() || "mcp-server-fetch";
  const args = process.env.FETCH_MCP_ARGS
    ? JSON.parse(process.env.FETCH_MCP_ARGS)
    : [];
  if (
    !Array.isArray(args) ||
    !args.every((argument) => typeof argument === "string")
  ) {
    throw new Error("FETCH_MCP_ARGS must be a JSON array of strings");
  }
  const transport = new StdioClientTransport({
    command,
    args,
    stderr: "inherit",
    maxBufferSize: 256 * 1024,
  });
  const client = new Client(
    { name: "dira-fetch-http-gateway", version: "1.0.0" },
    { capabilities: {} },
  );
  const startedAt = Date.now();
  logEvent("backend_connection", { status: "started" });
  try {
    await client.connect(transport, { timeout: 30_000 });
    const toolList = await client.listTools(undefined, { timeout: 10_000 });
    const fetchTool = toolList.tools.find(
      (tool) => tool.name === FETCH_TOOL_NAME,
    );
    if (!fetchTool) throw new Error("Fetch tool is unavailable");
    logEvent("backend_connection", {
      status: "success",
      duration_ms: Date.now() - startedAt,
    });
    logEvent("tool_discovery", {
      tool_name: FETCH_TOOL_NAME,
      status: "success",
    });
    const httpServer = createFetchHttpServer({
      token: process.env.FETCH_MCP_AUTH_TOKEN,
      upstreamClient: client,
      fetchTool,
      host: process.env.HOST || "0.0.0.0",
      port: Number(process.env.PORT || 10_000),
    });
    await httpServer.listen();
    logEvent("http_server_started", { status: "success" });

    let stopping = false;
    const stop = async (signal) => {
      if (stopping) return;
      stopping = true;
      logEvent("shutdown", { signal });
      await httpServer.close();
      await client.close();
      process.exit(0);
    };
    process.once("SIGTERM", () => void stop("SIGTERM"));
    process.once("SIGINT", () => void stop("SIGINT"));
  } catch (error) {
    logEvent("backend_connection", {
      status: "error",
      error_code: error instanceof Error ? error.name : "UnknownError",
      duration_ms: Date.now() - startedAt,
    });
    try {
      await client.close();
    } catch {
      logEvent("backend_cleanup", { status: "error" });
    }
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  start().catch(() => process.exit(1));
}
