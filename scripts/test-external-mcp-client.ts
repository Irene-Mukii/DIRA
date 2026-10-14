import { config } from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

config({ path: ".env.local" });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main() {
  const endpoint = process.env.DIRA_MCP_SERVER_URL?.trim();
  const accessToken = process.env.DIRA_MCP_ACCESS_TOKEN?.trim();
  if (!endpoint || !accessToken) {
    throw new Error(
      "DIRA_MCP_SERVER_URL and DIRA_MCP_ACCESS_TOKEN must be configured",
    );
  }

  const endpointUrl = new URL(endpoint);
  const localHttp =
    process.env.NODE_ENV !== "production" &&
    endpointUrl.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(endpointUrl.hostname);
  if (
    (endpointUrl.protocol !== "https:" && !localHttp) ||
    endpointUrl.username ||
    endpointUrl.password ||
    endpointUrl.search ||
    endpointUrl.hash
  ) {
    throw new Error("The external MCP test endpoint is not an allowed URL");
  }

  const client = new Client(
    { name: "dira-external-mcp-test", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(endpointUrl, {
    requestInit: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });

  try {
    await client.connect(transport, { timeout: 20_000 });
    const listedTools = await client.listTools(undefined, { timeout: 20_000 });
    const tools = listedTools.tools;
    const retrievalTool = tools.find(
      (tool) => tool.name === "retrieve_education_resources",
    );
    if (!retrievalTool) {
      throw new Error("The MCP server did not advertise education retrieval");
    }
    if (
      !isRecord(retrievalTool.inputSchema) ||
      !isRecord(retrievalTool.inputSchema.properties) ||
      !isRecord(retrievalTool.inputSchema.properties.query)
    ) {
      throw new Error("The education retrieval tool schema is invalid");
    }

    const response = await client.callTool(
      {
        name: "retrieve_education_resources",
        arguments: { query: "structured classroom discussion" },
      },
      undefined,
      { timeout: 20_000 },
    );
    const structured = isRecord(response.structuredContent)
      ? response.structuredContent
      : null;
    if (
      !structured ||
      !["success", "partial", "no_relevant_results", "failed"].includes(
        String(structured.status),
      ) ||
      !Array.isArray(structured.sources) ||
      structured.sources.length !== 4
    ) {
      throw new Error("Education retrieval returned an unexpected result shape");
    }

    console.info("External DIRA MCP discovery and safe invocation verified", {
      advertisedToolCount: tools.length,
      retrievalStatus: structured.status,
      sourceCount: structured.sources.length,
      sourceResults: structured.sources.map((source) => {
        if (!isRecord(source)) return { valid: false };
        return {
          key: source.key,
          status: source.status,
          error: source.error,
          httpStatus: source.http_status,
          durationMs: source.retrieval_duration_ms,
        };
      }),
    });
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("External DIRA MCP integration test failed:", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown error",
  });
  process.exitCode = 1;
});
