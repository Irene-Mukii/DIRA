import "server-only";

import { createHash } from "node:crypto";
import { createRunId, logAgentEvent } from "@/lib/agent/logger";

export const EDUCATION_CACHE_FRESHNESS_DAYS = 14;
export const MAX_EDUCATION_MARKDOWN_BYTES = 128_000;
const CACHE_FORMAT_VERSION = 1;
const CACHE_CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;
const MAX_EDUCATION_CACHE_SEARCH_RESULTS = 12;

const cacheCleanupGlobal = globalThis as typeof globalThis & {
  __diraEducationCacheCleanup?: ReturnType<typeof setInterval>;
};

export interface EducationMarkdownCacheEntry {
  sourceKey: string;
  canonicalUrl: string;
  title: string | null;
  markdown: string;
  contentSha256: string;
  contentBytes: number;
  lastSuccessfulAt: string;
}

export interface EducationMarkdownCacheMetadata {
  contentSha256: string;
  contentBytes: number;
  lastSuccessfulAt: string;
  hasMarkdown: boolean;
}

async function getPool() {
  return (await import("@/lib/db/client")).getPool();
}

export async function expireStaleEducationMarkdown(): Promise<number> {
  const pool = await getPool();
  const result = await pool.query(
    `UPDATE education_markdown_cache
     SET markdown = NULL, updated_at = NOW()
     WHERE markdown IS NOT NULL
       AND last_successful_at <= NOW() - INTERVAL '14 days'
     RETURNING source_key`,
  );
  const expiredRows = result.rowCount ?? 0;
  if (expiredRows > 0) {
    await logAgentEvent({
      run_id: createRunId(),
      workflow: "education_cache_maintenance",
      event_type: "cache_body_expired",
      agent_action: "cache_body_expired",
      tool_name: "education_markdown_cache",
      status: "success",
      metadata: { expired_rows: expiredRows },
    });
  }
  return expiredRows;
}

export function startEducationCacheCleanup(): void {
  if (cacheCleanupGlobal.__diraEducationCacheCleanup) return;

  const cleanup = async () => {
    try {
      await expireStaleEducationMarkdown();
    } catch (error) {
      console.error("Education Markdown cache cleanup failed:", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  };

  void cleanup();
  const timer = setInterval(() => void cleanup(), CACHE_CLEANUP_INTERVAL_MS);
  timer.unref();
  cacheCleanupGlobal.__diraEducationCacheCleanup = timer;
}

export async function getFreshEducationMarkdown(
  sourceKey: string,
  canonicalUrl: string,
): Promise<EducationMarkdownCacheEntry | null> {
  const pool = await getPool();
  const result = await pool.query<EducationMarkdownCacheEntry>(
    `SELECT
       source_key AS "sourceKey",
       canonical_url AS "canonicalUrl",
       title,
       markdown,
       content_sha256 AS "contentSha256",
       content_bytes AS "contentBytes",
       last_successful_at AS "lastSuccessfulAt"
     FROM education_markdown_cache
     WHERE source_key = $1
       AND canonical_url = $2
       AND format_version = $3
       AND markdown IS NOT NULL
       AND last_successful_at > NOW() - INTERVAL '14 days'`,
    [sourceKey, canonicalUrl, CACHE_FORMAT_VERSION],
  );
  const row = result.rows[0];
  if (!row || typeof row.markdown !== "string") return null;

  return {
    ...row,
    lastSuccessfulAt: new Date(row.lastSuccessfulAt).toISOString(),
  };
}

export async function searchFreshEducationMarkdown(
  sourceKey: string,
  queryTerms: string[],
): Promise<EducationMarkdownCacheEntry[]> {
  const terms = [...new Set(queryTerms.map((term) => term.toLowerCase()))]
    .filter((term) => term.length > 0);
  if (terms.length === 0) return [];

  const pool = await getPool();
  const result = await pool.query<EducationMarkdownCacheEntry>(
    `SELECT
       cache.source_key AS "sourceKey",
       cache.canonical_url AS "canonicalUrl",
       cache.title,
       cache.markdown,
       cache.content_sha256 AS "contentSha256",
       cache.content_bytes AS "contentBytes",
       cache.last_successful_at AS "lastSuccessfulAt"
     FROM education_markdown_cache AS cache
     CROSS JOIN LATERAL (
       SELECT COUNT(*) AS relevance_score
       FROM unnest($2::text[]) AS query_terms(term)
       WHERE strpos(
         lower(concat_ws(' ', cache.title, cache.markdown)),
         query_terms.term
       ) > 0
     ) AS relevance
     WHERE cache.source_key = $1
       AND cache.format_version = $3
       AND cache.markdown IS NOT NULL
       AND cache.last_successful_at > NOW() - INTERVAL '14 days'
       AND relevance.relevance_score > 0
     ORDER BY relevance.relevance_score DESC, cache.last_successful_at DESC
     LIMIT $4`,
    [sourceKey, terms, CACHE_FORMAT_VERSION, MAX_EDUCATION_CACHE_SEARCH_RESULTS],
  );

  return result.rows.map((row) => ({
    ...row,
    lastSuccessfulAt: new Date(row.lastSuccessfulAt).toISOString(),
  }));
}

export async function getEducationMarkdownMetadata(
  sourceKey: string,
  canonicalUrl: string,
): Promise<EducationMarkdownCacheMetadata | null> {
  const pool = await getPool();
  const result = await pool.query<{
    contentSha256: string;
    contentBytes: number;
    lastSuccessfulAt: Date | string;
    hasMarkdown: boolean;
  }>(
    `SELECT
       content_sha256 AS "contentSha256",
       content_bytes AS "contentBytes",
       last_successful_at AS "lastSuccessfulAt",
       markdown IS NOT NULL AS "hasMarkdown"
     FROM education_markdown_cache
     WHERE source_key = $1
       AND canonical_url = $2
       AND format_version = $3`,
    [sourceKey, canonicalUrl, CACHE_FORMAT_VERSION],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    lastSuccessfulAt: new Date(row.lastSuccessfulAt).toISOString(),
  };
}

export async function saveEducationMarkdown(
  entry: Omit<EducationMarkdownCacheEntry, "lastSuccessfulAt">,
): Promise<EducationMarkdownCacheEntry> {
  const actualBytes = Buffer.byteLength(entry.markdown, "utf8");
  if (
    !Number.isInteger(entry.contentBytes) ||
    entry.contentBytes < 1 ||
    entry.contentBytes > MAX_EDUCATION_MARKDOWN_BYTES ||
    entry.contentBytes !== actualBytes
  ) {
    throw new Error("Education Markdown exceeds the approved cache size limit");
  }
  const actualHash = createHash("sha256").update(entry.markdown).digest("hex");
  if (entry.contentSha256 !== actualHash) {
    throw new Error("Education Markdown cache hash does not match its content");
  }
  const parsedUrl = new URL(entry.canonicalUrl);
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.href !== entry.canonicalUrl ||
    entry.canonicalUrl.length > 2_048
  ) {
    throw new Error("Education Markdown cache URL is not canonical HTTPS");
  }

  const pool = await getPool();
  const result = await pool.query<EducationMarkdownCacheEntry>(
    `INSERT INTO education_markdown_cache (
       source_key,
       canonical_url,
       title,
       markdown,
       content_sha256,
       content_bytes,
       format_version,
       last_successful_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (source_key, canonical_url, format_version)
     DO UPDATE SET
       title = EXCLUDED.title,
       markdown = EXCLUDED.markdown,
       content_sha256 = EXCLUDED.content_sha256,
       content_bytes = EXCLUDED.content_bytes,
       last_successful_at = NOW(),
       updated_at = NOW()
     RETURNING
       source_key AS "sourceKey",
       canonical_url AS "canonicalUrl",
       title,
       markdown,
       content_sha256 AS "contentSha256",
       content_bytes AS "contentBytes",
       last_successful_at AS "lastSuccessfulAt"`,
    [
      entry.sourceKey,
      entry.canonicalUrl,
      entry.title,
      entry.markdown,
      entry.contentSha256,
      entry.contentBytes,
      CACHE_FORMAT_VERSION,
    ],
  );
  const row = result.rows[0];
  if (!row || typeof row.markdown !== "string") {
    throw new Error("Education Markdown cache write returned no content");
  }
  return {
    ...row,
    lastSuccessfulAt: new Date(row.lastSuccessfulAt).toISOString(),
  };
}
