import { afterEach, describe, expect, it, vi } from "vitest";

const testDoubles = vi.hoisted(() => ({
  pool: { query: vi.fn() },
  logger: {
    createRunId: vi.fn(() => "22222222-2222-4222-8222-222222222222"),
    logAgentEvent: vi.fn(async () => true),
  },
}));

vi.mock("@/lib/db/client", () => ({ pool: testDoubles.pool }));
vi.mock("@/lib/agent/logger", () => testDoubles.logger);

import {
  expireStaleEducationMarkdown,
  getFreshEducationMarkdown,
  MAX_EDUCATION_MARKDOWN_BYTES,
  saveEducationMarkdown,
  searchFreshEducationMarkdown,
} from "../lib/services/education-markdown-cache.ts";

afterEach(() => {
  vi.clearAllMocks();
});

describe("education Markdown cache", () => {
  it("queries only non-expired Markdown and keeps the 14-day boundary in PostgreSQL", async () => {
    testDoubles.pool.query.mockResolvedValue({
      rows: [{
        sourceKey: "WWC",
        canonicalUrl: "https://ies.ed.gov/ncee/wwc/",
        title: "WWC",
        markdown: "# WWC",
        contentSha256: "a".repeat(64),
        contentBytes: 5,
        lastSuccessfulAt: new Date("2026-10-14T00:00:00.000Z"),
      }],
    });

    const entry = await getFreshEducationMarkdown(
      "WWC",
      "https://ies.ed.gov/ncee/wwc/",
    );

    expect(entry?.lastSuccessfulAt).toBe("2026-10-14T00:00:00.000Z");
    expect(testDoubles.pool.query.mock.calls[0][0]).toContain(
      "last_successful_at > NOW() - INTERVAL '14 days'",
    );
    expect(testDoubles.pool.query.mock.calls[0][0]).toContain(
      "markdown IS NOT NULL",
    );
  });

  it("purges only the expired body while retaining cache metadata", async () => {
    testDoubles.pool.query.mockResolvedValue({ rowCount: 1 });

    await expect(expireStaleEducationMarkdown()).resolves.toBe(1);

    const sql = testDoubles.pool.query.mock.calls[0][0];
    expect(sql).toContain("SET markdown = NULL");
    expect(sql).toContain("last_successful_at <= NOW() - INTERVAL '14 days'");
    expect(sql).not.toContain("DELETE FROM");
    expect(testDoubles.logger.logAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "cache_body_expired",
        metadata: { expired_rows: 1 },
      }),
    );
  });

  it("searches only fresh source Markdown matching query terms and bounds results", async () => {
    testDoubles.pool.query.mockResolvedValue({
      rows: [{
        sourceKey: "WWC",
        canonicalUrl: "https://ies.ed.gov/ncee/wwc/",
        title: "Participation",
        markdown: "# Participation",
        contentSha256: "a".repeat(64),
        contentBytes: 14,
        lastSuccessfulAt: new Date("2026-10-14T00:00:00.000Z"),
      }],
    });

    const entries = await searchFreshEducationMarkdown(
      "WWC",
      ["Participation", "participation", "discussion"],
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].lastSuccessfulAt).toBe("2026-10-14T00:00:00.000Z");
    const [sql, parameters] = testDoubles.pool.query.mock.calls[0];
    expect(sql).toContain("cache.source_key = $1");
    expect(sql).toContain("cache.last_successful_at > NOW() - INTERVAL '14 days'");
    expect(sql).toContain("relevance.relevance_score > 0");
    expect(sql).toContain("LIMIT $4");
    expect(parameters).toEqual(["WWC", ["participation", "discussion"], 1, 12]);
  });

  it("validates UTF-8 size and content hash before persisting Markdown", async () => {
    const markdown = "evidence é";
    const bytes = Buffer.byteLength(markdown, "utf8");
    const { createHash } = await import("node:crypto");
    const contentSha256 = createHash("sha256").update(markdown).digest("hex");
    testDoubles.pool.query.mockResolvedValue({
      rows: [{
        sourceKey: "WWC",
        canonicalUrl: "https://ies.ed.gov/ncee/wwc/",
        title: "WWC",
        markdown,
        contentSha256,
        contentBytes: bytes,
        lastSuccessfulAt: new Date("2026-10-14T00:00:00.000Z"),
      }],
    });

    const entry = await saveEducationMarkdown({
      sourceKey: "WWC",
      canonicalUrl: "https://ies.ed.gov/ncee/wwc/",
      title: "WWC",
      markdown,
      contentSha256,
      contentBytes: bytes,
    });

    expect(entry.contentBytes).toBe(bytes);
    expect(testDoubles.pool.query).toHaveBeenCalledOnce();
    await expect(saveEducationMarkdown({
      sourceKey: "WWC",
      canonicalUrl: "https://ies.ed.gov/ncee/wwc/",
      title: "WWC",
      markdown,
      contentSha256: "0".repeat(64),
      contentBytes: bytes,
    })).rejects.toThrow(/hash does not match/i);
    expect(MAX_EDUCATION_MARKDOWN_BYTES).toBe(128_000);
  });
});
