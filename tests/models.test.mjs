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
      .resolves.toEqual({ content: "Generated activity", toolCalls: [] });

    expect(timeout).toHaveBeenCalledWith(75_000);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.signal).toBe(signal);
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
