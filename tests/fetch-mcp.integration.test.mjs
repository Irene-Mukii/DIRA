import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

config({ path: ".env.local" });

const shouldRun = process.env.RUN_FETCH_MCP_INTEGRATION === "true";
const shouldRunRemote = process.env.RUN_FETCH_MCP_REMOTE_INTEGRATION === "true";
const sourceKey = "WWC";
const sourceDomain = "ies.ed.gov";
const testUrl = `https://${sourceDomain}/ncee/wwc/?dira-cache-test=${randomUUID()}`;
let pool;

function response(url, body, contentType = "text/html") {
  const result = new Response(body, {
    status: 200,
    headers: { "content-type": contentType },
  });
  Object.defineProperty(result, "url", { value: url });
  return result;
}

afterAll(async () => {
  vi.unstubAllGlobals();
  if (!pool) return;
  await pool.query(
    "DELETE FROM education_markdown_cache WHERE source_key = $1 AND canonical_url = $2",
    [sourceKey, testUrl],
  );
  await pool.end();
});

describe("Fetch MCP and PostgreSQL integration", () => {
  it.skipIf(!shouldRun)(
    "retrieves and caches an approved public source, then serves a cache hit",
    async () => {
      if (process.env.FETCH_MCP_ENABLED !== "true") {
        throw new Error(
          "FETCH_MCP_ENABLED must be true for this integration test",
        );
      }
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
      const databaseTarget = new URL(databaseUrl);
      if (
        !["localhost", "127.0.0.1", "::1"].includes(databaseTarget.hostname) ||
        databaseTarget.pathname !== "/dira_dev" ||
        databaseTarget.username !== "dira_dev"
      ) {
        throw new Error("Refusing integration test outside local dira_dev");
      }

      const { pool: databasePool } = await import("../lib/db/client.ts");
      const { retrieveEducationEvidence } =
        await import("../lib/services/education-retrieval.ts");
      pool = databasePool;
      const firstRunId = randomUUID();
      const secondRunId = randomUUID();
      const source = {
        key: sourceKey,
        name: "What Works Clearinghouse",
        url: testUrl,
        domain: sourceDomain,
      };
      vi.stubGlobal("fetch", async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/robots.txt") {
          return response(
            url.href,
            "User-agent: *\nAllow: /\nSitemap: https://ies.ed.gov/sitemap.xml",
            "text/plain",
          );
        }
        if (url.pathname === "/sitemap.xml") {
          return response(
            url.href,
            `<urlset><url><loc>${testUrl}</loc></url></urlset>`,
            "application/xml",
          );
        }
        return response(
          url.href,
          "<html><head><title>What Works evidence</title></head><body>Evidence based practice supports effective teaching and learning.</body></html>",
        );

      });

      const first = await retrieveEducationEvidence(
        "find what works evidence based practice",
        [source],
        { runId: firstRunId, workflow: "fetch_mcp_integration" },
      );
      const second = await retrieveEducationEvidence(
        "find what works evidence based practice",
        [source],
        { runId: secondRunId, workflow: "fetch_mcp_integration" },
      );
      const events = await pool.query(
        `SELECT run_id::text, event_type, status
         FROM agent_activity_logs
         WHERE run_id IN ($1::uuid, $2::uuid)
         ORDER BY timestamp, id`,
        [firstRunId, secondRunId],
      );

      expect(first.sources[0].status).toBe("success");
      expect(second.sources[0].status).toBe("success");
      expect(events.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            run_id: firstRunId,
            event_type: "fetch_request",
            status: "success",
          }),
          expect.objectContaining({
            run_id: firstRunId,
            event_type: "cache_refresh",
            status: "success",
          }),
          expect.objectContaining({
            run_id: secondRunId,
            event_type: "cache_hit",
            status: "success",
          }),
        ]),
      );
      expect(
        events.rows.some(
          (event) =>
            event.run_id === secondRunId &&
            event.event_type === "fetch_request",
        ),
      ).toBe(false);
    },
    90_000,
  );
});

describe("remote Fetch MCP integration", () => {
  it.skipIf(!shouldRunRemote)(
    "connects to the configured Render Fetch MCP endpoint and invokes the real fetch tool",
    async () => {
      if (process.env.FETCH_MCP_TRANSPORT !== "http") {
        throw new Error(
          "FETCH_MCP_TRANSPORT must be http for this integration test",
        );
      }
      if (!process.env.FETCH_MCP_URL || !process.env.FETCH_MCP_TOKEN) {
        throw new Error("FETCH_MCP_URL and FETCH_MCP_TOKEN are required");
      }
      const { connectFetchMcp } = await import("../lib/services/fetch-mcp.ts");
      const session = await connectFetchMcp(10_000, {
        runId: randomUUID(),
        workflow: "fetch_mcp_remote_integration",
      });
      try {
        const result = await session.fetchMarkdown(
          "https://ies.ed.gov/ncee/wwc/",
          2_000,
          10_000,
        );
        expect(session.transport).toBe("http");
        expect(result.pageUrl).toBe("https://ies.ed.gov/ncee/wwc/");
        expect(result.markdown.trim().length).toBeGreaterThan(0);
      } finally {
        await session.close();
      }
    },
    45_000,
  );
});
