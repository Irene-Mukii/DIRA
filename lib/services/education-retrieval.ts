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
  error: "timeout" | "provider_error" | null;
}

export interface EducationSourceDefinition {
  key: EducationSource["key"];
  name: string;
  url: string;
  domain: string;
}

const MAX_SITEMAP_BYTES = 256_000;
const MAX_PAGE_BYTES = 128_000;
const MAX_PAGES_PER_SOURCE = 3;
const REQUEST_TIMEOUT_MS = 3_500;
const SAFE_DOMAIN_SUFFIXES = [
  "ibo.org",
  "educationendowmentfoundation.org.uk",
  "montessori-ami.org",
  "ies.ed.gov",
];

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
): Promise<string | null> {
  const response = await fetch(url, {
    headers: { accept: "text/html, application/xml, text/xml" },
    signal,
    redirect: "follow",
  });
  if (!response.ok || !isAllowedUrl(response.url, allowedDomain)) return null;
  return readBoundedResponse(response, maximumBytes);
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

async function retrieveFromSource(
  source: EducationSourceDefinition,
  queryTerms: string[],
): Promise<EducationSource> {
  const failed = (error: EducationSource["error"]): EducationSource => ({
    key: source.key,
    name: source.name,
    url: source.url,
    status: "failed",
    retrieved_at: null,
    title: null,
    page_url: null,
    excerpt: null,
    error,
  });
  try {
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2);
    const root = new URL(source.url);
    let sitemap = await fetchOfficialText(
      new URL("/sitemap.xml", root),
      source.domain,
      MAX_SITEMAP_BYTES,
      signal,
    );
    if (!sitemap) {
      const robots = await fetchOfficialText(
        new URL("/robots.txt", root),
        source.domain,
        32_000,
        signal,
      );
      const location = robots?.match(/^sitemap:\s*(\S+)/im)?.[1];
      const sitemapUrl = location ? isAllowedUrl(location, source.domain) : null;
      if (sitemapUrl) {
        sitemap = await fetchOfficialText(
          sitemapUrl,
          source.domain,
          MAX_SITEMAP_BYTES,
          signal,
        );
      }
    }
    if (!sitemap) return failed("provider_error");

    const locations = sitemapLocations(sitemap, source.domain);
    const childSitemaps = locations
      .filter((url) => /\.xml(?:$|\?)/i.test(url.href))
      .slice(0, 2);
    const pages = locations.filter((url) => !/\.xml(?:$|\?)/i.test(url.href));
    for (const child of childSitemaps) {
      const childContent = await fetchOfficialText(
        child,
        source.domain,
        MAX_SITEMAP_BYTES,
        signal,
      );
      if (childContent) pages.push(...sitemapLocations(childContent, source.domain));
    }
    const candidates = [...new Map(
      pages
        .map((url) => [url.href, url] as const)
        .sort((left, right) => (
          relevanceScore(right[0], queryTerms) -
          relevanceScore(left[0], queryTerms)
        )),
    ).values()].slice(0, MAX_PAGES_PER_SOURCE);
    let best: { url: URL; title: string | null; text: string; score: number } | null = null;
    for (const pageUrl of candidates) {
      const html = await fetchOfficialText(
        pageUrl,
        source.domain,
        MAX_PAGE_BYTES,
        signal,
      );
      if (!html) continue;
      const content = plainText(html);
      const score = relevanceScore(`${content.title ?? ""} ${content.text}`, queryTerms);
      if (!best || score > best.score) {
        best = { url: pageUrl, ...content, score };
      }
    }
    if (!best || best.score < 1) {
      return {
        key: source.key,
        name: source.name,
        url: source.url,
        status: "no_relevant_results",
        retrieved_at: new Date().toISOString(),
        title: null,
        page_url: null,
        excerpt: null,
        error: null,
      };
    }
    return {
      key: source.key,
      name: source.name,
      url: source.url,
      status: "success",
      retrieved_at: new Date().toISOString(),
      title: best.title,
      page_url: best.url.href,
      excerpt: relevantExcerpt(best.text, queryTerms),
      error: null,
    };
  } catch (error) {
    return failed(
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
        ? "timeout"
        : "provider_error",
    );
  }
}

export async function retrieveEducationEvidence(
  observationType: string,
  sources: readonly EducationSourceDefinition[],
): Promise<{ status: EducationRetrievalStatus; sources: EducationSource[] }> {
  const normalizedType = observationType.replaceAll("_", " ").toLowerCase();
  const queryTerms = normalizedType.split(/\s+/).filter((term) => term.length > 2);

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
