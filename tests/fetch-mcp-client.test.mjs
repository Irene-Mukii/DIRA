import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transportInstances: [],
  clientOptions: [],
  clientConnectError: null,
  listToolsError: null,
  tools: [{ name: "fetch" }],
  toolResult: {
    content: [
      {
        type: "text",
        text: "Contents of https://ies.ed.gov/ncee/wwc/:\nEvidence content",
      },
    ],
  },
  callToolError: null,
  logAgentEvent: vi.fn(async () => true),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    constructor(...args) {
      mocks.clientOptions.push(args);
    }

    async connect(transport, options) {
      mocks.connectedTransport = transport;
      mocks.connectOptions = options;
      if (mocks.clientConnectError) throw mocks.clientConnectError;
    }

    async listTools(_args, options) {
      mocks.listToolsOptions = options;
      if (mocks.listToolsError) throw mocks.listToolsError;
      return { tools: mocks.tools };
    }

    async callTool(params, _schema, options) {
      mocks.callToolParams = params;
      mocks.callToolOptions = options;
      if (mocks.callToolError) throw mocks.callToolError;
      return mocks.toolResult;
    }

    async close() {
      mocks.closeCount = (mocks.closeCount ?? 0) + 1;
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  getDefaultEnvironment: () => ({ PATH: "test-path" }),
  StdioClientTransport: class MockStdioClientTransport {
    constructor(options) {
      this.options = options;
      mocks.transportInstances.push({ type: "stdio", options });
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class MockHttpClientTransport {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      mocks.transportInstances.push({ type: "http", url, options });
    }
  },
}));

vi.mock("@/lib/agent/logger", () => ({
  logAgentEvent: mocks.logAgentEvent,
}));

const context = {
  runId: "11111111-1111-4111-8111-111111111111",
  workflow: "fetch_test",
};

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  mocks.transportInstances.length = 0;
  mocks.clientOptions.length = 0;
  mocks.clientConnectError = null;
  mocks.listToolsError = null;
  mocks.listToolsOptions = undefined;
  mocks.tools = [{ name: "fetch" }];
  mocks.toolResult = {
    content: [
      {
        type: "text",
        text: "Contents of https://ies.ed.gov/ncee/wwc/:\nEvidence content",
      },
    ],
  };
  mocks.callToolError = null;
  mocks.closeCount = 0;
  mocks.logAgentEvent.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function fetchMcpModule() {
  return import("../lib/services/fetch-mcp.ts");
}

describe("Fetch MCP transport selection", () => {
  it("preserves the pinned stdio launcher and normalized tool contract", async () => {
    const { connectFetchMcp } = await fetchMcpModule();
    const session = await connectFetchMcp(8_000, context);

    expect(session.transport).toBe("stdio");
    expect(mocks.transportInstances[0]).toMatchObject({
      type: "stdio",
      options: {
        command: "uvx",
        args: ["--from", "mcp-server-fetch==2026.10.10", "mcp-server-fetch"],
        maxBufferSize: 256 * 1024,
      },
    });
    expect(mocks.connectedTransport.options.command).toBe("uvx");
    await expect(
      session.fetchMarkdown("https://ies.ed.gov/ncee/wwc/", 128_000, 8_000),
    ).resolves.toEqual({
      markdown: "Evidence content",
      pageUrl: "https://ies.ed.gov/ncee/wwc/",
    });
    expect(mocks.callToolParams).toEqual({
      name: "fetch",
      arguments: {
        url: "https://ies.ed.gov/ncee/wwc/",
        max_length: 128_000,
        start_index: 0,
        raw: false,
      },
    });
    await session.close();
    expect(mocks.closeCount).toBe(1);
  });

  it("connects to remote Streamable HTTP with server-only bearer and correlation headers", async () => {
    const token = "s".repeat(64);
    vi.stubEnv("FETCH_MCP_TRANSPORT", "http");
    vi.stubEnv("FETCH_MCP_URL", "https://fetch.example.com/mcp");
    vi.stubEnv("FETCH_MCP_TOKEN", token);
    const { connectFetchMcp } = await fetchMcpModule();
    const session = await connectFetchMcp(8_000, context);

    expect(session.transport).toBe("http");
    expect(mocks.transportInstances[0]).toMatchObject({
      type: "http",
      url: new URL("https://fetch.example.com/mcp"),
      options: {
        requestInit: {
          headers: {
            authorization: `Bearer ${token}`,
            "x-dira-correlation-id": context.runId,
          },
        },
        reconnectionOptions: { maxRetries: 0 },
      },
    });
    expect(JSON.stringify(mocks.logAgentEvent.mock.calls)).not.toContain(token);
    await expect(
      session.fetchMarkdown("https://ies.ed.gov/ncee/wwc/", 128_000, 8_000),
    ).resolves.toEqual({
      markdown: "Evidence content",
      pageUrl: "https://ies.ed.gov/ncee/wwc/",
    });
    expect(mocks.callToolParams).toEqual({
      name: "fetch",
      arguments: {
        url: "https://ies.ed.gov/ncee/wwc/",
        max_length: 128_000,
        start_index: 0,
        raw: false,
      },
    });
    await session.close();
  });

  it.each([
    ["missing endpoint", undefined, "s".repeat(64)],
    ["invalid URL", "not a URL", "s".repeat(64)],
    ["missing token", "https://fetch.example.com/mcp", undefined],
    ["short token", "https://fetch.example.com/mcp", "short"],
  ])("rejects remote configuration: %s", async (_name, url, token) => {
    vi.stubEnv("FETCH_MCP_TRANSPORT", "http");
    if (url !== undefined) vi.stubEnv("FETCH_MCP_URL", url);
    if (token !== undefined) vi.stubEnv("FETCH_MCP_TOKEN", token);
    const { connectFetchMcp } = await fetchMcpModule();

    await expect(connectFetchMcp(8_000, context)).rejects.toMatchObject({
      code: "provider_error",
    });
    expect(mocks.transportInstances).toHaveLength(0);
    expect(mocks.logAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "fetch_connection",
        status: "error",
      }),
    );
  });

  it("rejects endpoint credentials, queries, fragments, and non-HTTPS URLs", async () => {
    vi.stubEnv("FETCH_MCP_TRANSPORT", "http");
    vi.stubEnv("FETCH_MCP_TOKEN", "s".repeat(64));
    const { connectFetchMcp } = await fetchMcpModule();

    for (const url of [
      "http://fetch.example.com/mcp",
      "https://user:pass@fetch.example.com/mcp",
      "https://fetch.example.com/mcp?token=secret",
      "https://fetch.example.com/mcp#fragment",
    ]) {
      vi.stubEnv("FETCH_MCP_URL", url);
      await expect(connectFetchMcp(8_000, context)).rejects.toMatchObject({
        code: "provider_error",
      });
    }
    expect(mocks.transportInstances).toHaveLength(0);
  });

  it("reports tool-discovery failures and cleans up the client", async () => {
    vi.stubEnv("FETCH_MCP_TRANSPORT", "http");
    vi.stubEnv("FETCH_MCP_URL", "https://fetch.example.com/mcp");
    vi.stubEnv("FETCH_MCP_TOKEN", "s".repeat(64));
    mocks.tools = [{ name: "not-fetch" }];
    const { connectFetchMcp } = await fetchMcpModule();

    await expect(connectFetchMcp(8_000, context)).rejects.toMatchObject({
      code: "provider_error",
    });
    expect(mocks.closeCount).toBe(1);
    expect(mocks.logAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "fetch_tool_discovery",
        status: "error",
        error: "provider_error",
      }),
    );
  });

  it("bounds connection failures and does not retry", async () => {
    vi.stubEnv("FETCH_MCP_TRANSPORT", "http");
    vi.stubEnv("FETCH_MCP_URL", "https://fetch.example.com/mcp");
    vi.stubEnv("FETCH_MCP_TOKEN", "s".repeat(64));
    mocks.clientConnectError = new Error("Connection timed out");
    const { connectFetchMcp } = await fetchMcpModule();

    await expect(connectFetchMcp(250, context)).rejects.toMatchObject({
      code: "timeout",
    });
    expect(mocks.connectOptions).toEqual({ timeout: 250 });
    expect(mocks.closeCount).toBe(1);
    expect(mocks.listToolsOptions).toBeUndefined();
  });

  it("maps MCP errors and malformed results without success-shaped fallbacks", async () => {
    const { connectFetchMcp } = await fetchMcpModule();
    const session = await connectFetchMcp(8_000, context);

    mocks.callToolError = new Error("Request timed out");
    await expect(
      session.fetchMarkdown("https://ies.ed.gov", 1_000, 500),
    ).rejects.toMatchObject({ code: "timeout" });
    mocks.callToolError = null;
    mocks.toolResult = {
      isError: true,
      content: [{ type: "text", text: "HTTP Error 403" }],
    };
    await expect(
      session.fetchMarkdown("https://ies.ed.gov", 1_000, 500),
    ).rejects.toMatchObject({ code: "access_restricted", httpStatus: 403 });
    mocks.toolResult = {
      content: [{ type: "text", text: "not a Fetch result" }],
    };
    await expect(
      session.fetchMarkdown("https://ies.ed.gov", 1_000, 500),
    ).rejects.toMatchObject({ code: "content_extraction_failure" });
    await session.close();
  });
});
