import "server-only";

import { createHash } from "node:crypto";
import {
  createRunId,
  logAgentEvent,
  type AgentActivityEventType,
} from "@/lib/agent/logger";
import {
  expireStaleEducationMarkdown,
  getEducationMarkdownMetadata,
  getFreshEducationMarkdown,
  MAX_EDUCATION_MARKDOWN_BYTES,
  saveEducationMarkdown,
  searchFreshEducationMarkdown,
  type EducationMarkdownCacheEntry,
} from "@/lib/services/education-markdown-cache";
import {
  connectFetchMcp,
  FETCH_SERVER_VERSION,
  FetchMcpError,
  type FetchMcpSession,
} from "@/lib/services/fetch-mcp";

export type EducationRetrievalStatus =
  "success" | "partial" | "no_relevant_results" | "failed";

export interface EducationSource {
  key: "IB" | "EEF" | "AMI" | "WWC";
  name: string;
  url: string;
  status: "success" | "no_relevant_results" | "failed";
  retrieved_at: string | null;
  title: string | null;
  page_url: string | null;
  excerpt: string | null;
  error:
    | "timeout"
    | "access_restricted"
    | "http_error"
    | "network_error"
    | "discovery_failure"
    | "content_extraction_failure"
    | "response_too_large"
    | "unsupported_content"
    | "provider_error"
    | null;
  http_status: number | null;
  retrieval_duration_ms: number | null;
}

export interface EducationSourceDefinition {
  key: EducationSource["key"];
  name: string;
  url: string;
  domain: string;
}

export const EDUCATION_SOURCES: readonly EducationSourceDefinition[] = [
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

const MAX_SITEMAP_BYTES = 256_000;
const MAX_PAGE_BYTES = 128_000;
const MAX_PAGES_PER_SOURCE = 3;
const REQUEST_TIMEOUT_MS = 3_500;
const FETCH_MCP_CONNECT_TIMEOUT_MS = 8_000;
const FETCH_MCP_REQUEST_TIMEOUT_MS = 8_000;
const MAX_FETCH_REDIRECTS = 5;
class EducationRetrievalError extends Error {
  constructor(
    public readonly code: NonNullable<EducationSource["error"]>,
    public readonly httpStatus: number | null = null,
  ) {
    super(code);
    this.name = "EducationRetrievalError";
  }
}

interface RetrievedText {
  content: string;
  httpStatus: number;
  pageUrl: string;
}

export interface EducationRetrievalOptions {
  runId?: string;
  workflow?: string;
  fetchMcpEnabled?: boolean;
}

function sanitizedUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "invalid_url";
  }
}

function isAllowedUrl(value: string, allowedDomain: string): URL | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== "" ||
      (url.hostname !== allowedDomain &&
        !url.hostname.endsWith(`.${allowedDomain}`))
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function readBoundedResponse(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error("response_too_large");
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new Error("response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchOfficialText(
  url: URL,
  allowedDomain: string,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<RetrievedText | null> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      headers: { accept: "text/html, application/xml, text/xml" },
      signal,
      redirect: "follow",
    });
    if (!response.ok) {
      const code =
        response.status === 401 || response.status === 403
          ? "access_restricted"
          : "http_error";
      console.warn("Education source request failed", {
        source_domain: allowedDomain,
        target_url: sanitizedUrl(url.href),
        http_status: response.status,
        duration_ms: Date.now() - startedAt,
        error: code,
      });
      throw new EducationRetrievalError(code, response.status);
    }
    if (!isAllowedUrl(response.url, allowedDomain)) {
      throw new EducationRetrievalError("access_restricted", response.status);
    }
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      contentType &&
      !/(?:text\/html|application\/(?:xml|xhtml\+xml)|text\/xml|text\/plain)/.test(
        contentType,
      )
    ) {
      throw new EducationRetrievalError("unsupported_content", response.status);
    }
    const text = await readBoundedResponse(response, maximumBytes);
    console.info("Education source request completed", {
      source_domain: allowedDomain,
      target_url: sanitizedUrl(url.href),
      http_status: response.status,
      duration_ms: Date.now() - startedAt,
    });
    return {
      content: text,
      httpStatus: response.status,
      pageUrl: response.url,
    };
  } catch (error) {
    if (error instanceof EducationRetrievalError) throw error;
    const timeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    const code = timeout
      ? "timeout"
      : error instanceof Error && error.message === "response_too_large"
        ? "response_too_large"
        : "network_error";
    console.warn("Education source request failed", {
      source_domain: allowedDomain,
      target_url: sanitizedUrl(url.href),
      duration_ms: Date.now() - startedAt,
      error: code,
    });
    throw new EducationRetrievalError(code);
  }
}

function sitemapLocations(xml: string, allowedDomain: string): URL[] {
  const urls: URL[] = [];
  for (const match of xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) {
    const candidate = isAllowedUrl(
      match[1].replaceAll("&amp;", "&").trim(),
      allowedDomain,
    );
    if (candidate) urls.push(candidate);
    if (urls.length >= 250) break;
  }
  return urls;
}

function plainText(html: string): { title: string | null; text: string } {
  const title =
    html
      .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200) ?? null;
  const text = html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return { title, text };
}

function relevanceScore(text: string, queryTerms: string[]): number {
  const normalized = text.toLowerCase();
  return queryTerms.reduce(
    (score, term) => score + (normalized.includes(term) ? 1 : 0),
    0,
  );
}

function relevantExcerpt(text: string, queryTerms: string[]): string {
  const sentences = text.match(/[^.!?]+[.!?]?/g) ?? [text];
  const best = sentences
    .map((sentence) => ({
      sentence: sentence.trim(),
      score: relevanceScore(sentence, queryTerms),
    }))
    .sort((left, right) => right.score - left.score)[0]?.sentence;
  return (best || text).slice(0, 600);
}

function markdownText(markdown: string): {
  title: string | null;
  text: string;
} {
  const title =
    markdown
      .match(/^#{1,2}\s+(.+)$/m)?.[1]
      ?.trim()
      .slice(0, 200) ?? null;
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { title, text };
}

async function cancelResponseBody(response: Response): Promise<void> {
  if (!response.body) return;
  try {
    await response.body.cancel();
  } catch (error) {
    console.warn(
      "Education redirect validation could not cancel response body",
      {
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
    );
  }
}

async function validateFetchRedirects(
  initialUrl: URL,
  allowedDomain: string,
  signal: AbortSignal,
): Promise<URL> {
  let current = initialUrl;
  for (
    let redirectCount = 0;
    redirectCount <= MAX_FETCH_REDIRECTS;
    redirectCount += 1
  ) {
    const response = await fetch(current, {
      method: "GET",
      headers: {
        accept: "text/html, application/xhtml+xml",
        range: "bytes=0-0",
      },
      redirect: "manual",
      signal,
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400) {
      await cancelResponseBody(response);
      if (!location || redirectCount === MAX_FETCH_REDIRECTS) {
        throw new EducationRetrievalError("access_restricted", response.status);
      }
      const next = isAllowedUrl(new URL(location, current).href, allowedDomain);
      if (!next) {
        throw new EducationRetrievalError("access_restricted", response.status);
      }
      current = next;
      continue;
    }

    await cancelResponseBody(response);
    if (!response.ok) {
      const code =
        response.status === 401 || response.status === 403
          ? "access_restricted"
          : "http_error";
      throw new EducationRetrievalError(code, response.status);
    }
    const finalUrl = isAllowedUrl(response.url || current.href, allowedDomain);
    if (!finalUrl) {
      throw new EducationRetrievalError("access_restricted", response.status);
    }
    return finalUrl;
  }
  throw new EducationRetrievalError("access_restricted");
}

async function logRetrievalActivity(
  runId: string,
  workflow: string,
  eventType: AgentActivityEventType,
  source: EducationSourceDefinition,
  status: "started" | "success" | "error",
  metadata: Record<string, unknown> = {},
  error?: string,
  durationMs?: number,
): Promise<void> {
  await logAgentEvent({
    run_id: runId,
    workflow,
    event_type: eventType,
    agent_action: eventType,
    tool_name: "retrieve_education_resources",
    status,
    ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
    ...(error ? { error } : {}),
    metadata: {
      source_key: source.key,
      source_domain: source.domain,
      ...metadata,
    },
  });
}

function mapFetchError(error: unknown): EducationRetrievalError {
  if (error instanceof EducationRetrievalError) return error;
  if (error instanceof FetchMcpError) {
    return new EducationRetrievalError(error.code, error.httpStatus);
  }
  return new EducationRetrievalError(
    error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
      ? "timeout"
      : error instanceof TypeError
        ? "network_error"
        : "provider_error",
  );
}

function noRelevantResult(
  source: EducationSourceDefinition,
  startedAt: number,
  httpStatus: number | null,
): EducationSource {
  const result: EducationSource = {
    key: source.key,
    name: source.name,
    url: source.url,
    status: "no_relevant_results",
    retrieved_at: new Date().toISOString(),
    title: null,
    page_url: null,
    excerpt: null,
    error: null,
    http_status: httpStatus,
    retrieval_duration_ms: Date.now() - startedAt,
  };
  console.info("Education source retrieval complete", {
    source: source.key,
    target_url: sanitizedUrl(source.url),
    status: result.status,
    http_status: result.http_status,
    duration_ms: result.retrieval_duration_ms,
  });
  return result;
}

async function retrieveFromSource(
  source: EducationSourceDefinition,
  queryTerms: string[],
  runId: string,
  workflow: string,
  getFetchSession: (() => Promise<FetchMcpSession>) | null,
): Promise<EducationSource> {
  const startedAt = Date.now();
  const failed = (
    error: NonNullable<EducationSource["error"]>,
    httpStatus: number | null = null,
  ): EducationSource => {
    const result: EducationSource = {
      key: source.key,
      name: source.name,
      url: source.url,
      status: "failed",
      retrieved_at: new Date().toISOString(),
      title: null,
      page_url: null,
      excerpt: null,
      error,
      http_status: httpStatus,
      retrieval_duration_ms: Date.now() - startedAt,
    };
    console.warn("Education source retrieval failed", {
      source: source.key,
      target_url: sanitizedUrl(source.url),
      http_status: httpStatus,
      duration_ms: result.retrieval_duration_ms,
      error,
    });
    return result;
  };
  try {
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2);
    const root = new URL(source.url);
    const cacheReads = new Map<string, EducationMarkdownCacheEntry | null>();
    const readCache = async (
      cacheUrl: string,
    ): Promise<EducationMarkdownCacheEntry | null> => {
      if (!getFetchSession) return null;
      if (cacheReads.has(cacheUrl)) return cacheReads.get(cacheUrl) ?? null;
      try {
        const cached = await getFreshEducationMarkdown(source.key, cacheUrl);
        cacheReads.set(cacheUrl, cached);
        if (cached) {
          await logRetrievalActivity(
            runId,
            workflow,
            "cache_hit",
            source,
            "success",
            {
              canonical_url: sanitizedUrl(cacheUrl),
              content_bytes: cached.contentBytes,
              content_sha256: cached.contentSha256,
            },
          );
          return cached;
        }
        const metadata = await getEducationMarkdownMetadata(
          source.key,
          cacheUrl,
        );
        await logRetrievalActivity(
          runId,
          workflow,
          metadata ? "cache_refresh" : "cache_miss",
          source,
          "success",
          {
            canonical_url: sanitizedUrl(cacheUrl),
            has_markdown: metadata?.hasMarkdown ?? false,
            last_successful_at: metadata?.lastSuccessfulAt ?? null,
          },
        );
        return null;
      } catch (error) {
        cacheReads.set(cacheUrl, null);
        await logRetrievalActivity(
          runId,
          workflow,
          "cache_refresh_failed",
          source,
          "error",
          { canonical_url: sanitizedUrl(cacheUrl), phase: "cache_read" },
          error instanceof Error ? error.name : "UnknownError",
        );
        return null;
      }
    };
    if (getFetchSession && queryTerms.length > 0) {
      try {
        const cachedEntries = await searchFreshEducationMarkdown(
          source.key,
          queryTerms,
        );
        let invalidCachedUrls = 0;
        const relevantCachedEntries = cachedEntries
          .flatMap((entry) => {
            const cachedUrl = isAllowedUrl(entry.canonicalUrl, source.domain);
            if (
              entry.sourceKey !== source.key ||
              !cachedUrl ||
              cachedUrl.href !== entry.canonicalUrl
            ) {
              invalidCachedUrls += 1;
              return [];
            }
            const content = markdownText(entry.markdown);
            if (!content.text) return [];
            const score = relevanceScore(
              `${entry.title ?? ""} ${content.title ?? ""} ${content.text}`,
              queryTerms,
            );
            return score > 0 ? [{ entry, content, score }] : [];
          })
          .sort((left, right) => right.score - left.score);
        if (invalidCachedUrls > 0) {
          await logRetrievalActivity(
            runId,
            workflow,
            "cache_refresh_failed",
            source,
            "error",
            {
              phase: "cache_search_validation",
              invalid_entries: invalidCachedUrls,
            },
            "invalid_cached_url",
          );
        }
        const bestCached = relevantCachedEntries[0];
        await logRetrievalActivity(
          runId,
          workflow,
          bestCached ? "cache_hit" : "cache_miss",
          source,
          "success",
          {
            lookup_mode: "cached_page_search",
            pages_examined: cachedEntries.length,
            ...(bestCached
              ? {
                  canonical_url: sanitizedUrl(bestCached.entry.canonicalUrl),
                  content_bytes: bestCached.entry.contentBytes,
                  content_sha256: bestCached.entry.contentSha256,
                }
              : {}),
          },
        );
        if (bestCached) {
          const result: EducationSource = {
            key: source.key,
            name: source.name,
            url: source.url,
            status: "success",
            retrieved_at: new Date().toISOString(),
            title: bestCached.content.title ?? bestCached.entry.title,
            page_url: bestCached.entry.canonicalUrl,
            excerpt: relevantExcerpt(bestCached.content.text, queryTerms),
            error: null,
            http_status: null,
            retrieval_duration_ms: Date.now() - startedAt,
          };
          console.info("Education source retrieval complete", {
            source: source.key,
            target_url: sanitizedUrl(bestCached.entry.canonicalUrl),
            status: result.status,
            cache_hit: true,
            duration_ms: result.retrieval_duration_ms,
          });
          return result;
        }
      } catch (error) {
        await logRetrievalActivity(
          runId,
          workflow,
          "cache_refresh_failed",
          source,
          "error",
          { phase: "cache_search", lookup_mode: "cached_page_search" },
          error instanceof Error ? error.name : "UnknownError",
        );
      }
    }
    const retrieveMarkdown = async (
      cacheUrl: string,
      pageUrl: URL,
    ): Promise<{
      title: string | null;
      text: string;
      score: number;
      pageUrl: URL;
    }> => {
      if (!getFetchSession) throw new FetchMcpError("provider_error");
      const fetchStartedAt = Date.now();
      const configuredTransport = process.env.FETCH_MCP_TRANSPORT?.trim();
      const transport =
        configuredTransport === "http" || configuredTransport === "stdio"
          ? configuredTransport
          : configuredTransport
            ? "invalid"
            : "stdio";
      await logRetrievalActivity(
        runId,
        workflow,
        "fetch_request",
        source,
        "started",
        {
          requested_url: sanitizedUrl(pageUrl.href),
          server_version: FETCH_SERVER_VERSION,
          transport,
          correlation_id: runId,
        },
      );
      try {
        const safePageUrl = await validateFetchRedirects(
          pageUrl,
          source.domain,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        );
        const activeSession = await getFetchSession();
        const fetched = await activeSession.fetchMarkdown(
          safePageUrl.href,
          MAX_PAGE_BYTES,
          FETCH_MCP_REQUEST_TIMEOUT_MS,
        );
        const echoedUrl = isAllowedUrl(fetched.pageUrl, source.domain);
        if (!echoedUrl || echoedUrl.href !== safePageUrl.href) {
          throw new EducationRetrievalError("access_restricted");
        }
        const contentBytes = Buffer.byteLength(fetched.markdown, "utf8");
        const content = markdownText(fetched.markdown);
        if (
          contentBytes < 1 ||
          contentBytes > MAX_EDUCATION_MARKDOWN_BYTES ||
          !content.text
        ) {
          throw new EducationRetrievalError(
            contentBytes > MAX_EDUCATION_MARKDOWN_BYTES
              ? "response_too_large"
              : "content_extraction_failure",
          );
        }
        await logRetrievalActivity(
          runId,
          workflow,
          "fetch_request",
          source,
          "success",
          {
            page_url: sanitizedUrl(safePageUrl.href),
            markdown_bytes: contentBytes,
            server_version: FETCH_SERVER_VERSION,
            transport: activeSession.transport,
            correlation_id: runId,
          },
          undefined,
          Date.now() - fetchStartedAt,
        );
        const contentSha256 = createHash("sha256")
          .update(fetched.markdown)
          .digest("hex");
        try {
          await saveEducationMarkdown({
            sourceKey: source.key,
            canonicalUrl: cacheUrl,
            title: content.title,
            markdown: fetched.markdown,
            contentSha256,
            contentBytes,
          });
          await logRetrievalActivity(
            runId,
            workflow,
            "cache_refresh",
            source,
            "success",
            {
              canonical_url: sanitizedUrl(cacheUrl),
              content_bytes: contentBytes,
              content_sha256: contentSha256,
            },
          );
        } catch (error) {
          await logRetrievalActivity(
            runId,
            workflow,
            "cache_refresh_failed",
            source,
            "error",
            { canonical_url: sanitizedUrl(cacheUrl), phase: "cache_write" },
            error instanceof Error ? error.name : "UnknownError",
          );
        }
        return {
          ...content,
          score: relevanceScore(
            `${content.title ?? ""} ${content.text}`,
            queryTerms,
          ),
          pageUrl: safePageUrl,
        };
      } catch (error) {
        const retrievalError = mapFetchError(error);
        await logRetrievalActivity(
          runId,
          workflow,
          "cache_refresh_failed",
          source,
          "error",
          { canonical_url: sanitizedUrl(cacheUrl), phase: "fetch_mcp" },
          retrievalError.code,
        );
        await logRetrievalActivity(
          runId,
          workflow,
          "fetch_request",
          source,
          "error",
          {
            requested_url: sanitizedUrl(pageUrl.href),
            server_version: FETCH_SERVER_VERSION,
            transport,
            correlation_id: runId,
          },
          retrievalError.code,
          Date.now() - fetchStartedAt,
        );
        throw retrievalError;
      }
    };
    let sitemap: RetrievedText | null = null;
    let discoveryError: EducationRetrievalError | null = null;
    try {
      sitemap = await fetchOfficialText(
        new URL("/sitemap.xml", root),
        source.domain,
        MAX_SITEMAP_BYTES,
        signal,
      );
    } catch (error) {
      if (!(error instanceof EducationRetrievalError)) throw error;
      discoveryError = error;
    }
    if (!sitemap) {
      let robots: RetrievedText | null = null;
      try {
        robots = await fetchOfficialText(
          new URL("/robots.txt", root),
          source.domain,
          32_000,
          signal,
        );
      } catch (error) {
        if (!(error instanceof EducationRetrievalError)) throw error;
        discoveryError = error;
      }
      const location = robots?.content.match(/^sitemap:\s*(\S+)/im)?.[1];
      const sitemapUrl = location
        ? isAllowedUrl(location, source.domain)
        : null;
      if (sitemapUrl) {
        try {
          sitemap = await fetchOfficialText(
            sitemapUrl,
            source.domain,
            MAX_SITEMAP_BYTES,
            signal,
          );
        } catch (error) {
          if (!(error instanceof EducationRetrievalError)) throw error;
          discoveryError = error;
        }
      }
    }
    if (!sitemap) {
      if (getFetchSession && discoveryError?.code === "response_too_large") {
        const homepageCache = await readCache(root.href);
        let homepage: {
          title: string | null;
          text: string;
          score: number;
          pageUrl: URL;
          httpStatus: number | null;
        } | null = null;
        if (homepageCache) {
          const content = markdownText(homepageCache.markdown);
          homepage = {
            ...content,
            score: relevanceScore(
              `${content.title ?? ""} ${content.text}`,
              queryTerms,
            ),
            pageUrl: new URL(homepageCache.canonicalUrl),
            httpStatus: null,
          };
        } else {
          try {
            const directHomepage = await fetchOfficialText(
              root,
              source.domain,
              MAX_PAGE_BYTES,
              signal,
            );
            if (directHomepage) {
              const content = plainText(directHomepage.content);
              homepage = {
                ...content,
                score: relevanceScore(
                  `${content.title ?? ""} ${content.text}`,
                  queryTerms,
                ),
                pageUrl: new URL(directHomepage.pageUrl),
                httpStatus: directHomepage.httpStatus,
              };
            }
          } catch (error) {
            if (error instanceof EducationRetrievalError) {
              discoveryError = error;
            } else {
              throw error;
            }
          }
          if (homepage) {
            try {
              const fetched = await retrieveMarkdown(
                root.href,
                homepage.pageUrl,
              );
              if (fetched.score >= homepage.score) {
                homepage = { ...fetched, httpStatus: homepage.httpStatus };
              }
            } catch {
              // The already validated direct extraction remains a safe fallback.
            }
          }
        }
        if (homepage && homepage.score > 0) {
          return {
            key: source.key,
            name: source.name,
            url: source.url,
            status: "success",
            retrieved_at: new Date().toISOString(),
            title: homepage.title,
            page_url: homepage.pageUrl.href,
            excerpt: relevantExcerpt(homepage.text, queryTerms),
            error: null,
            http_status: homepage.httpStatus,
            retrieval_duration_ms: Date.now() - startedAt,
          };
        }
      }
      return failed(
        discoveryError?.code ?? "discovery_failure",
        discoveryError?.httpStatus ?? null,
      );
    }

    const locations = sitemapLocations(sitemap.content, source.domain);
    if (locations.length === 0) {
      return noRelevantResult(source, startedAt, sitemap.httpStatus);
    }
    const childSitemaps = locations
      .filter((url) => /\.xml(?:$|\?)/i.test(url.href))
      .slice(0, 2);
    const pages = locations.filter((url) => !/\.xml(?:$|\?)/i.test(url.href));
    for (const child of childSitemaps) {
      let childContent: RetrievedText | null = null;
      try {
        childContent = await fetchOfficialText(
          child,
          source.domain,
          MAX_SITEMAP_BYTES,
          signal,
        );
      } catch (error) {
        if (!(error instanceof EducationRetrievalError)) throw error;
      }
      if (childContent) {
        pages.push(...sitemapLocations(childContent.content, source.domain));
      }
    }
    const candidates = [
      ...new Map(
        pages
          .map((url) => [url.href, url] as const)
          .sort(
            (left, right) =>
              relevanceScore(right[0], queryTerms) -
              relevanceScore(left[0], queryTerms),
          ),
      ).values(),
    ].slice(0, MAX_PAGES_PER_SOURCE);
    let best: {
      url: URL;
      cacheUrl: string;
      title: string | null;
      text: string;
      score: number;
      httpStatus: number | null;
      fromCache: boolean;
    } | null = null;
    let fetchedPages = 0;
    let lastError: EducationRetrievalError | null = null;
    for (const pageUrl of candidates) {
      const cached = await readCache(pageUrl.href);
      if (cached) {
        const content = markdownText(cached.markdown);
        if (!content.text) continue;
        fetchedPages += 1;
        const score = relevanceScore(
          `${content.title ?? ""} ${content.text}`,
          queryTerms,
        );
        if (!best || score > best.score) {
          best = {
            url: new URL(cached.canonicalUrl),
            cacheUrl: pageUrl.href,
            ...content,
            score,
            httpStatus: null,
            fromCache: true,
          };
        }
        continue;
      }
      try {
        const page = await fetchOfficialText(
          pageUrl,
          source.domain,
          MAX_PAGE_BYTES,
          signal,
        );
        if (!page) continue;
        const content = plainText(page.content);
        if (!content.text) continue;
        fetchedPages += 1;
        const score = relevanceScore(
          `${content.title ?? ""} ${content.text}`,
          queryTerms,
        );
        if (!best || score > best.score) {
          best = {
            url: new URL(page.pageUrl),
            cacheUrl: pageUrl.href,
            ...content,
            score,
            httpStatus: page.httpStatus,
            fromCache: false,
          };
        }
      } catch (error) {
        if (error instanceof EducationRetrievalError) lastError = error;
        continue;
      }
    }
    if (
      fetchedPages === 0 &&
      lastError &&
      getFetchSession &&
      candidates.length > 0
    ) {
      try {
        const fetched = await retrieveMarkdown(
          candidates[0].href,
          candidates[0],
        );
        if (fetched.text) {
          best = {
            ...fetched,
            url: fetched.pageUrl,
            cacheUrl: candidates[0].href,
            httpStatus: lastError.httpStatus,
            fromCache: false,
          };
          fetchedPages = 1;
        }
      } catch (error) {
        lastError = mapFetchError(error);
      }
    }
    if (fetchedPages === 0 && lastError) {
      return failed(lastError.code, lastError.httpStatus);
    }
    if (candidates.length === 0 || fetchedPages === 0) {
      return failed("content_extraction_failure");
    }
    if (!best || best.score < 1) {
      return noRelevantResult(
        source,
        startedAt,
        best?.httpStatus ?? sitemap.httpStatus,
      );
    }
    if (getFetchSession && !best.fromCache) {
      try {
        const fetched = await retrieveMarkdown(best.cacheUrl, best.url);
        if (fetched.score >= best.score) {
          best = {
            ...best,
            ...fetched,
            url: fetched.pageUrl,
          };
        }
      } catch {
        // Preserve the existing validated direct result when Fetch MCP fails.
      }
    }
    const result: EducationSource = {
      key: source.key,
      name: source.name,
      url: source.url,
      status: "success",
      retrieved_at: new Date().toISOString(),
      title: best.title,
      page_url: best.url.href,
      excerpt: relevantExcerpt(best.text, queryTerms),
      error: null,
      http_status: best.httpStatus,
      retrieval_duration_ms: Date.now() - startedAt,
    };
    console.info("Education source retrieval complete", {
      source: source.key,
      target_url: sanitizedUrl(best.url.href),
      status: result.status,
      http_status: result.http_status,
      duration_ms: result.retrieval_duration_ms,
    });
    return result;
  } catch (error) {
    const result =
      error instanceof EducationRetrievalError
        ? failed(error.code, error.httpStatus)
        : failed(
            error instanceof Error &&
              (error.name === "TimeoutError" || error.name === "AbortError")
              ? "timeout"
              : "provider_error",
          );
    return result;
  }
}

export async function retrieveEducationEvidence(
  query: string,
  sources: readonly EducationSourceDefinition[],
  options: EducationRetrievalOptions = {},
): Promise<{ status: EducationRetrievalStatus; sources: EducationSource[] }> {
  const runId = options.runId ?? createRunId();
  const workflow = options.workflow ?? "education_retrieval";
  const fetchEnabled =
    options.fetchMcpEnabled ?? process.env.FETCH_MCP_ENABLED === "true";
  const fetchSessionState: { promise: Promise<FetchMcpSession> | null } = {
    promise: null,
  };
  const getFetchSession = fetchEnabled
    ? () => {
        if (!fetchSessionState.promise) {
          fetchSessionState.promise = connectFetchMcp(
            FETCH_MCP_CONNECT_TIMEOUT_MS,
            { runId, workflow },
          );
        }
        return fetchSessionState.promise;
      }
    : null;

  if (fetchEnabled) {
    try {
      await expireStaleEducationMarkdown();
    } catch (error) {
      await logAgentEvent({
        run_id: runId,
        workflow,
        event_type: "cache_refresh_failed",
        agent_action: "cache_expiry_failed",
        tool_name: "retrieve_education_resources",
        status: "error",
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
  const normalizedQuery = query.replaceAll("_", " ").toLowerCase();
  const queryTerms = [
    ...new Set(normalizedQuery.split(/\s+/).filter((term) => term.length > 2)),
  ].slice(0, 24);

  const results = await Promise.all(
    sources.map((source) =>
      retrieveFromSource(source, queryTerms, runId, workflow, getFetchSession),
    ),
  );
  if (fetchSessionState.promise) {
    await fetchSessionState.promise.then(
      async (session) => {
        try {
          await session.close();
        } catch (error) {
          console.error("Fetch MCP session cleanup failed:", {
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
        }
      },
      () => {
        // The source-level Fetch MCP failure has already been logged.
      },
    );
  }
  const successful = results.filter(
    (source) => source.status === "success",
  ).length;
  const queried = results.filter((source) => source.status !== "failed").length;
  const status: EducationRetrievalStatus =
    successful === results.length
      ? "success"
      : successful > 0 || queried > 0
        ? "partial"
        : "failed";
  return {
    status:
      successful === 0 && queried === results.length
        ? "no_relevant_results"
        : status,
    sources: results,
  };
}
