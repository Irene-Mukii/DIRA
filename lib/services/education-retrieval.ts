export type EducationRetrievalStatus =
  | "success"
  | "partial"
  | "no_relevant_results"
  | "failed";

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
      const code = response.status === 401 || response.status === 403
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
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      contentType &&
      !/(?:text\/html|application\/(?:xml|xhtml\+xml)|text\/xml|text\/plain)/.test(contentType)
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
    return { content: text, httpStatus: response.status };
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
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
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
      const sitemapUrl = location ? isAllowedUrl(location, source.domain) : null;
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
    const candidates = [...new Map(
      pages
        .map((url) => [url.href, url] as const)
        .sort((left, right) => (
          relevanceScore(right[0], queryTerms) -
          relevanceScore(left[0], queryTerms)
        )),
    ).values()].slice(0, MAX_PAGES_PER_SOURCE);
    let best: {
      url: URL;
      title: string | null;
      text: string;
      score: number;
      httpStatus: number;
    } | null = null;
    let fetchedPages = 0;
    let lastError: EducationRetrievalError | null = null;
    for (const pageUrl of candidates) {
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
        const score = relevanceScore(`${content.title ?? ""} ${content.text}`, queryTerms);
        if (!best || score > best.score) {
          best = { url: pageUrl, ...content, score, httpStatus: page.httpStatus };
        }
      } catch (error) {
        if (error instanceof EducationRetrievalError) lastError = error;
        continue;
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
    const result = error instanceof EducationRetrievalError
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
): Promise<{ status: EducationRetrievalStatus; sources: EducationSource[] }> {
  const normalizedQuery = query.replaceAll("_", " ").toLowerCase();
  const queryTerms = [...new Set(
    normalizedQuery.split(/\s+/).filter((term) => term.length > 2),
  )].slice(0, 24);

  const results = await Promise.all(
    sources.map((source) => retrieveFromSource(source, queryTerms)),
  );
  const successful = results.filter((source) => source.status === "success").length;
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
