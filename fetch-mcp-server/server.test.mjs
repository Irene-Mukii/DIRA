import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createFetchHttpServer } from "./server.mjs";

const token = "a".repeat(64);
const fetchTool = {
  name: "fetch",
  description: "Fetch a URL and convert HTML to Markdown.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string" },
      max_length: { type: "integer" },
      start_index: { type: "integer" },
      raw: { type: "boolean" },
    },
    required: ["url"],
  },
};
const upstreamCalls = [];
const upstreamCallOptions = [];
let httpServer;
let endpoint;
let client;

before(async () => {
  const server = createFetchHttpServer({
    token,
    fetchTool,
    upstreamClient: {
      async callTool(params, _schema, options) {
        upstreamCalls.push(params);
        upstreamCallOptions.push(options);
        return {
          content: [
            {
              type: "text",
              text: `Contents of ${params.arguments.url}:\n# Verified evidence`,
            },
          ],
        };
      },
    },
    host: "127.0.0.1",
    port: 0,
  });
  const address = await server.listen();
  httpServer = server;
  endpoint = `http://127.0.0.1:${address.port}/mcp`;
});

after(async () => {
  if (client) await client.close();
  if (httpServer) await httpServer.close();
});

describe("Render Fetch MCP gateway", () => {
  it("rejects requests without the shared bearer token and serves health checks", async () => {
    const unauthorized = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    assert.equal(unauthorized.status, 401);
    const invalidToken = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${"b".repeat(64)}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    assert.equal(invalidToken.status, 401);
    assert.equal(upstreamCalls.length, 0);

    const health = await fetch(new URL("/health", endpoint));
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
  });

  it("discovers and invokes the same bounded Fetch tool over Streamable HTTP", async () => {
    client = new Client(
      { name: "fetch-gateway-test", version: "1.0.0" },
      { capabilities: {} },
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(endpoint), {
        requestInit: {
          headers: {
            authorization: `Bearer ${token}`,
            "x-dira-correlation-id": "11111111-1111-4111-8111-111111111111",
          },
        },
      }),
    );
    const discovered = await client.listTools();
    assert.deepEqual(discovered.tools, [fetchTool]);

    const result = await client.callTool({
      name: "fetch",
      arguments: {
        url: "https://ies.ed.gov/ncee/wwc/",
        max_length: 128_000,
        start_index: 0,
        raw: false,
      },
    });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Verified evidence/);
    assert.equal(upstreamCalls.length, 1);
    assert.deepEqual(upstreamCallOptions[0], { timeout: 30_000 });
  });

  it("rejects unsupported hosts and over-limit fetch lengths before calling Fetch", async () => {
    const result = await client.callTool({
      name: "fetch",
      arguments: {
        url: "https://example.com/",
        max_length: 128_000,
        start_index: 0,
        raw: false,
      },
    });
    assert.equal(result.isError, true);
    assert.equal(upstreamCalls.length, 1);

    const oversized = await client.callTool({
      name: "fetch",
      arguments: {
        url: "https://ies.ed.gov/ncee/wwc/",
        max_length: 128_001,
        start_index: 0,
        raw: false,
      },
    });
    assert.equal(oversized.isError, true);
    assert.equal(upstreamCalls.length, 1);
  });

  it("requires a sufficiently long server-side token", () => {
    assert.throws(
      () =>
        createFetchHttpServer({
          token: "short",
          upstreamClient: {},
          fetchTool,
        }),
      /FETCH_MCP_AUTH_TOKEN/,
    );
  });

  it("preserves provider failures as MCP tool errors", async () => {
    const failingGateway = createFetchHttpServer({
      token,
      fetchTool,
      upstreamClient: {
        async callTool() {
          throw new Error("private provider diagnostic");
        },
      },
      host: "127.0.0.1",
      port: 0,
    });
    const address = await failingGateway.listen();
    const failingClient = new Client(
      { name: "fetch-gateway-failure-test", version: "1.0.0" },
      { capabilities: {} },
    );
    try {
      await failingClient.connect(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${address.port}/mcp`),
          { requestInit: { headers: { authorization: `Bearer ${token}` } } },
        ),
      );
      const result = await failingClient.callTool({
        name: "fetch",
        arguments: {
          url: "https://ies.ed.gov/ncee/wwc/",
          max_length: 128_000,
          start_index: 0,
          raw: false,
        },
      });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /provider error/i);
      assert.doesNotMatch(result.content[0].text, /private provider diagnostic/);
    } finally {
      await failingClient.close();
      await failingGateway.close();
    }
  });
});
