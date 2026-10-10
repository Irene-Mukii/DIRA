import { timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createDiraMcpServer } from "@/lib/mcp-tools/dira-server";

export const runtime = "nodejs";

async function handleMcpRequest(request: Request): Promise<Response> {
  const expectedToken = process.env.DIRA_MCP_ACCESS_TOKEN;
  if (!expectedToken) {
    return Response.json(
      { error: "Dira MCP server access is not configured" },
      { status: 503 },
    );
  }

  const suppliedToken = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!suppliedToken || !tokensMatch(suppliedToken, expectedToken)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const server = createDiraMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 64 * 1024,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    console.error("Dira MCP request failed:", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "Dira MCP request failed" }, { status: 500 });
  } finally {
    try {
      await server.close();
    } catch (error) {
      console.error("Dira MCP cleanup failed:", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}

function tokensMatch(supplied: string, expected: string): boolean {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export const POST = handleMcpRequest;
export const GET = handleMcpRequest;
export const DELETE = handleMcpRequest;
