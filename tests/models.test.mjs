import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createAgentCompletion,
  GlmRequestError,
} from "../lib/models.ts";

describe("GLM completion requests", () => {
  beforeEach(() => {
    vi.stubEnv("ZAI_API_KEY", "test-api-key");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("allows 75 seconds for a completion request", async () => {
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Generated activity" } }],
        }),
        { status: 200 },
      ),
    );

    await expect(createAgentCompletion([{ role: "user", content: "Suggest" }], []))
      .resolves.toEqual({
        content: "Generated activity",
        toolCalls: [],
        usage: null,
      });

    expect(timeout).toHaveBeenCalledWith(75_000);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.signal).toBe(signal);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1].body)).toMatchObject({
      model: "glm-5.3-flash",
      reasoning_effort: "low",
      response_format: { type: "json_object" },
    });
  });

  it("keeps JSON response mode off when function tools are provided", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: "call-1",
                type: "function",
                function: { name: "example_tool", arguments: "{}" },
              }],
            },
          }],
        }),
        { status: 200 },
      ),
    );

    await createAgentCompletion([{ role: "user", content: "Use the tool" }], [{
      name: "example_tool",
      description: "An example function",
      parameters: { type: "object", properties: {} },
    }]);

    const requestBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(requestBody.reasoning_effort).toBe("low");
    expect(requestBody.response_format).toBeUndefined();
    expect(requestBody.tools).toHaveLength(1);
  });

  it("captures provider token usage when the response includes it", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Generated activity" } }],
          usage: {
            prompt_tokens: 1_000,
            completion_tokens: 250,
            prompt_tokens_details: { cached_tokens: 400 },
          },
        }),
        { status: 200 },
      ),
    );

    await expect(createAgentCompletion(
      [{ role: "user", content: "Suggest" }],
      [],
    )).resolves.toMatchObject({
      usage: {
        inputTokens: 1_000,
        outputTokens: 250,
        cachedInputTokens: 400,
      },
    });
  });

  it("logs the underlying network error and cause without logging credentials", async () => {
    const cause = Object.assign(new Error("connect ECONNRESET api.z.ai:443"), {
      code: "ECONNRESET",
      syscall: "connect",
      hostname: "api.z.ai",
    });
    const error = Object.assign(new TypeError("fetch failed"), { cause });
    vi.mocked(fetch).mockRejectedValue(error);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      createAgentCompletion([{ role: "user", content: "Suggest" }], []),
    ).rejects.toBeInstanceOf(GlmRequestError);

    expect(errorLog).toHaveBeenCalledWith(
      "GLM request failed",
      expect.objectContaining({
        failure_type: "network",
        error: expect.objectContaining({
          errorName: "TypeError",
          errorMessage: "fetch failed",
          cause: expect.objectContaining({
            errorCode: "ECONNRESET",
            syscall: "connect",
            hostname: "api.z.ai",
          }),
        }),
      }),
    );
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("test-api-key");
  });
});
