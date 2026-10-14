import assert from "node:assert/strict";
import { afterEach, describe, expect, it, vi } from "vitest";

const testDoubles = vi.hoisted(() => {
  const cache = {
    expireStaleEducationMarkdown: vi.fn(async () => 0),
    getFreshEducationMarkdown: vi.fn(async () => null),
    searchFreshEducationMarkdown: vi.fn(async () => []),
    getEducationMarkdownMetadata: vi.fn(async () => null),
    saveEducationMarkdown: vi.fn(async (entry) => ({
      ...entry,
      lastSuccessfulAt: new Date().toISOString(),
    })),
  };
  const session = {
    transport: "stdio",
    fetchMarkdown: vi.fn(),
    close: vi.fn(async () => {}),
  };
  class FetchMcpError extends Error {
    constructor(code, httpStatus = null) {
      super(code);
      this.code = code;
      this.httpStatus = httpStatus;
    }
  }
  return {
    cache,
    fetchMcp: {
      FETCH_SERVER_VERSION: "2026.10.10",
      FetchMcpError,
      connectFetchMcp: vi.fn(async () => session),
      session,
    },
    logger: {
      createRunId: vi.fn(() => "11111111-1111-4111-8111-111111111111"),
      logAgentEvent: vi.fn(async () => true),
    },
  };
});

vi.mock("@/lib/services/education-markdown-cache", () => ({
  EDUCATION_CACHE_FRESHNESS_DAYS: 14,
  MAX_EDUCATION_MARKDOWN_BYTES: 128_000,
  ...testDoubles.cache,
}));
vi.mock("@/lib/services/fetch-mcp", () => testDoubles.fetchMcp);
vi.mock("@/lib/agent/logger", () => testDoubles.logger);

const sources = [
  {
    key: "IB",
    name: "International Baccalaureate",
    url: "https://www.ibo.org/",
    domain: "ibo.org",
  },
  {
    key: "EEF",
    name: "Education Endowment Foundation",
    url: "https://educationendowmentfoundation.org.uk/",
    domain: "educationendowmentfoundation.org.uk",
  },
  {
    key: "AMI",
    name: "Association Montessori Internationale",
    url: "https://montessori-ami.org/",
    domain: "montessori-ami.org",
  },
  {
    key: "WWC",
    name: "What Works Clearinghouse",
    url: "https://ies.ed.gov/ncee/wwc/",
    domain: "ies.ed.gov",
  },
];

function response(url, body, status = 200) {
  const result = new Response(body, {
    status,
    headers: { "content-type": "text/xml" },
  });
  Object.defineProperty(result, "url", { value: url });
  return result;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  testDoubles.cache.expireStaleEducationMarkdown.mockResolvedValue(0);
  testDoubles.cache.getFreshEducationMarkdown.mockResolvedValue(null);
  testDoubles.cache.searchFreshEducationMarkdown.mockResolvedValue([]);
  testDoubles.cache.getEducationMarkdownMetadata.mockResolvedValue(null);
  testDoubles.cache.saveEducationMarkdown.mockImplementation(async (entry) => ({
    ...entry,
    lastSuccessfulAt: new Date().toISOString(),
  }));
  testDoubles.fetchMcp.connectFetchMcp.mockResolvedValue(
    testDoubles.fetchMcp.session,
  );
  testDoubles.fetchMcp.session.fetchMarkdown.mockReset();
  testDoubles.fetchMcp.session.close.mockReset();
});

describe("education source retrieval", () => {
  it("returns exact official page citations and a relevant short excerpt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/sitemap.xml") {
          return response(
            url.href,
            `<urlset><url><loc>https://${url.hostname}/resources/participation</loc></url></urlset>`,
          );
        }
        return response(
          url.href,
          "<html><head><title>Classroom participation</title></head><body>General school resources. Classroom participation can be supported through learner agency and structured discussion.</body></html>",
        );
      }),
    );
    const { retrieveEducationEvidence } =
      await import("../lib/services/education-retrieval.ts");

    const result = await retrieveEducationEvidence("participation", sources);

    expect(result.status).toBe("success");
    expect(result.sources).toHaveLength(4);
    expect(result.sources.every((source) => source.status === "success")).toBe(
      true,
    );
    expect(
      result.sources.every((source) =>
        source.page_url?.includes("/resources/participation"),
      ),
    ).toBe(true);
    expect(result.sources.every((source) => source.http_status === 200)).toBe(
      true,
    );
    expect(
      result.sources.every((source) => source.retrieval_duration_ms >= 0),
    ).toBe(true);
    expect(result.sources[0].excerpt).toMatch(/participation/i);
  });

  it("does not follow sitemap references outside the source's official domain", async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = new URL(String(input));
      return response(
        url.href,
        `<urlset><url><loc>https://untrusted.example/private</loc></url></urlset>`,
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { retrieveEducationEvidence } =
      await import("../lib/services/education-retrieval.ts");

    const result = await retrieveEducationEvidence("academic", sources);

    expect(result.status).toBe("no_relevant_results");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.sources.every((source) => source.page_url === null)).toBe(
      true,
    );
  });

  it("continues retrieving from other sources when one source denies access", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = new URL(String(input));
        if (url.hostname === "www.ibo.org" && url.pathname === "/sitemap.xml") {
          return response(url.href, "blocked", 403);
        }
        if (url.pathname === "/sitemap.xml") {
          return response(
            url.href,
            `<urlset><url><loc>https://${url.hostname}/resources/participation</loc></url></urlset>`,
          );
        }
        if (url.hostname === "www.ibo.org" && url.pathname === "/robots.txt") {
          return response(url.href, "User-agent: *");
        }
        return response(
          url.href,
          "<html><head><title>Participation</title></head><body>Classroom participation benefits from structured discussion.</body></html>",
        );
      }),
    );
    const { retrieveEducationEvidence } =
      await import("../lib/services/education-retrieval.ts");

    const result = await retrieveEducationEvidence("participation", sources);

    expect(result.status).toBe("partial");
    expect(result.sources.find((source) => source.key === "IB")).toMatchObject({
      status: "failed",
      error: "access_restricted",
      http_status: 403,
    });
    expect(
      result.sources.filter((source) => source.status === "success"),
    ).toHaveLength(3);
  });

  it("uses Fetch MCP only for approved pages and caches validated Markdown", async () => {
    const source = sources[0];
    const markdown =
      "# Participation\n\nResearch supports structured classroom discussion.";
    testDoubles.fetchMcp.session.fetchMarkdown.mockImplementation(
      async (url) => ({ markdown, pageUrl: url }),
    );
    vi.stubEnv("FETCH_MCP_ENABLED", "true");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/sitemap.xml") {
          return response(
            url.href,
            `<urlset><url><loc>https://${url.hostname}/resources/participation</loc></url></urlset>`,
          );
        }
        return response(
          url.href,
          "<html><head><title>Resource</title></head><body>Participation can be supported through learner agency and structured discussion.</body></html>",
        );
      }),
    );
    const { retrieveEducationEvidence } =
      await import("../lib/services/education-retrieval.ts");

    const result = await retrieveEducationEvidence("participation", [source], {
      runId: "11111111-1111-4111-8111-111111111111",
      workflow: "test",
      fetchMcpEnabled: true,
    });

    expect(result.sources[0].status).toBe("success");
    expect(testDoubles.fetchMcp.connectFetchMcp).toHaveBeenCalledOnce();
    expect(result.sources[0].excerpt).toMatch(/research supports/i);
    expect(testDoubles.fetchMcp.session.fetchMarkdown).toHaveBeenCalledWith(
      "https://www.ibo.org/resources/participation",
      128_000,
      expect.any(Number),
    );
    expect(testDoubles.logger.logAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "fetch_request",
        status: "success",
        metadata: expect.objectContaining({
          transport: "stdio",
          correlation_id: "11111111-1111-4111-8111-111111111111",
        }),
      }),
    );
    expect(testDoubles.cache.saveEducationMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKey: "IB",
        canonicalUrl: "https://www.ibo.org/resources/participation",
        markdown,
        contentBytes: Buffer.byteLength(markdown, "utf8"),
      }),
    );
  });

  it("serves fresh cached Markdown without starting Fetch MCP", async () => {
    const source = sources[0];
    const cacheEntry = {
      sourceKey: "IB",
      canonicalUrl: "https://www.ibo.org/resources/participation",
      title: "Participation",
      markdown: "# Participation\n\nCached structured discussion evidence.",
      contentSha256: "a".repeat(64),
      contentBytes: 56,
      lastSuccessfulAt: new Date().toISOString(),
    };
    testDoubles.cache.getFreshEducationMarkdown.mockResolvedValue(cacheEntry);
    vi.stubEnv("FETCH_MCP_ENABLED", "true");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = new URL(String(input));
        return url.pathname === "/sitemap.xml"
          ? response(
              url.href,
              `<urlset><url><loc>https://${url.hostname}/resources/participation</loc></url></urlset>`,
            )
          : response(url.href, "should not fetch page content");
      }),
    );
    const { retrieveEducationEvidence } =
      await import("../lib/services/education-retrieval.ts");

    const result = await retrieveEducationEvidence("participation", [source], {
      fetchMcpEnabled: true,
    });

    expect(result.sources[0].status).toBe("success");
    expect(result.sources[0].excerpt).toMatch(/cached structured discussion/i);
    expect(testDoubles.fetchMcp.connectFetchMcp).not.toHaveBeenCalled();
    expect(testDoubles.cache.saveEducationMarkdown).not.toHaveBeenCalled();
  });

  it("uses relevant cached pages before making any source URL requests", async () => {
    const source = sources[0];
    testDoubles.cache.searchFreshEducationMarkdown.mockResolvedValue([
      {
        sourceKey: source.key,
        canonicalUrl: "https://www.ibo.org/resources/participation",
        title: "Participation",
        markdown:
          "# Participation\n\nCached evidence supports structured classroom discussion.",
        contentSha256: "a".repeat(64),
        contentBytes: 82,
        lastSuccessfulAt: new Date().toISOString(),
      },
    ]);
    vi.stubEnv("FETCH_MCP_ENABLED", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { retrieveEducationEvidence } =
      await import("../lib/services/education-retrieval.ts");

    const result = await retrieveEducationEvidence("participation", [source], {
      fetchMcpEnabled: true,
    });

    expect(result.sources[0]).toMatchObject({
      status: "success",
      page_url: "https://www.ibo.org/resources/participation",
      http_status: null,
    });
    expect(result.sources[0].excerpt).toMatch(/cached evidence/i);
    expect(testDoubles.cache.searchFreshEducationMarkdown).toHaveBeenCalledWith(
      source.key,
      ["participation"],
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(testDoubles.fetchMcp.connectFetchMcp).not.toHaveBeenCalled();
    expect(testDoubles.logger.logAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "cache_hit",
        metadata: expect.objectContaining({
          lookup_mode: "cached_page_search",
          canonical_url: "https://www.ibo.org/resources/participation",
        }),
      }),
    );
  });

  it("falls back to source discovery when the cached-page search has no relevant result", async () => {
    const source = sources[0];
    testDoubles.cache.searchFreshEducationMarkdown.mockResolvedValue([
      {
        sourceKey: source.key,
        canonicalUrl: "https://www.ibo.org/resources/unrelated",
        title: "Unrelated",
        markdown: "# Unrelated\n\nThis page discusses unrelated content.",
        contentSha256: "b".repeat(64),
        contentBytes: 68,
        lastSuccessfulAt: new Date().toISOString(),
      },
    ]);
    testDoubles.fetchMcp.session.fetchMarkdown.mockResolvedValue({
      markdown:
        "# Participation\n\nClassroom participation supports structured discussion.",
      pageUrl: "https://www.ibo.org/resources/participation",
    });
    const fetchMock = vi.fn(async (input) => {
      const url = new URL(String(input));
      return url.pathname === "/sitemap.xml"
        ? response(
            url.href,
            `<urlset><url><loc>https://${url.hostname}/resources/participation</loc></url></urlset>`,
          )
        : response(
            url.href,
            "<html><head><title>Participation</title></head><body>Classroom participation benefits from structured discussion.</body></html>",
          );
    });
    vi.stubEnv("FETCH_MCP_ENABLED", "true");
    vi.stubGlobal("fetch", fetchMock);
    const { retrieveEducationEvidence } =
      await import("../lib/services/education-retrieval.ts");

    const result = await retrieveEducationEvidence("participation", [source], {
      fetchMcpEnabled: true,
    });

    expect(result.sources[0].status).toBe("success");
    expect(
      fetchMock.mock.calls.some(
        ([input]) => new URL(String(input)).pathname === "/sitemap.xml",
      ),
    ).toBe(true);
  });

  it("rejects off-domain Fetch redirects and keeps the validated direct result", async () => {
    const source = sources[0];
    vi.stubEnv("FETCH_MCP_ENABLED", "true");
    const fetchMock = vi.fn(async (input, init = {}) => {
      const url = new URL(String(input));
      if (url.pathname === "/sitemap.xml") {
        return response(
          url.href,
          `<urlset><url><loc>https://${url.hostname}/resources/participation</loc></url></urlset>`,
        );
      }
      if (init.redirect === "manual") {
        const redirect = new Response(null, {
          status: 302,
          headers: { location: "https://untrusted.example/redirected" },
        });
        Object.defineProperty(redirect, "url", { value: url.href });
        return redirect;
      }
      return response(
        url.href,
        "<html><head><title>Classroom participation</title></head><body>Classroom participation benefits from structured discussion.</body></html>",
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { retrieveEducationEvidence } =
      await import("../lib/services/education-retrieval.ts");

    const result = await retrieveEducationEvidence("participation", [source], {
      fetchMcpEnabled: true,
    });

    expect(result.sources[0].status).toBe("success");
    expect(result.sources[0].excerpt).toMatch(/structured discussion/i);
    expect(testDoubles.fetchMcp.connectFetchMcp).not.toHaveBeenCalled();
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.redirect === "manual"),
    ).toBe(true);
  });

  it("falls back to safe direct content when a stale cache refresh fails", async () => {
    const source = sources[0];
    testDoubles.cache.getEducationMarkdownMetadata.mockResolvedValue({
      contentSha256: "b".repeat(64),
      contentBytes: 64,
      lastSuccessfulAt: "2026-09-01T00:00:00.000Z",
      hasMarkdown: false,
    });
    testDoubles.fetchMcp.session.fetchMarkdown.mockRejectedValue(
      new testDoubles.fetchMcp.FetchMcpError("timeout"),
    );
    vi.stubEnv("FETCH_MCP_ENABLED", "true");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = new URL(String(input));
        return url.pathname === "/sitemap.xml"
          ? response(
              url.href,
              `<urlset><url><loc>https://${url.hostname}/resources/participation</loc></url></urlset>`,
            )
          : response(
              url.href,
              "<html><head><title>Classroom participation</title></head><body>Classroom participation benefits from structured discussion.</body></html>",
            );
      }),
    );
    const { retrieveEducationEvidence } =
      await import("../lib/services/education-retrieval.ts");

    const result = await retrieveEducationEvidence("participation", [source], {
      fetchMcpEnabled: true,
    });

    expect(result.sources[0].status).toBe("success");
    expect(result.sources[0].excerpt).toMatch(/structured discussion/i);
    expect(testDoubles.fetchMcp.session.fetchMarkdown).toHaveBeenCalledOnce();
    expect(testDoubles.cache.saveEducationMarkdown).not.toHaveBeenCalled();
    expect(testDoubles.logger.logAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "fetch_request",
        status: "error",
        error: "timeout",
        metadata: expect.objectContaining({
          transport: "stdio",
          correlation_id: "11111111-1111-4111-8111-111111111111",
        }),
      }),
    );
  });
});
