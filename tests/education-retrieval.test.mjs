import assert from "node:assert/strict";
import { afterEach, describe, expect, it, vi } from "vitest";

const sources = [
  { key: "IB", name: "International Baccalaureate", url: "https://www.ibo.org/", domain: "ibo.org" },
  { key: "EEF", name: "Education Endowment Foundation", url: "https://educationendowmentfoundation.org.uk/", domain: "educationendowmentfoundation.org.uk" },
  { key: "AMI", name: "Association Montessori Internationale", url: "https://montessori-ami.org/", domain: "montessori-ami.org" },
  { key: "WWC", name: "What Works Clearinghouse", url: "https://ies.ed.gov/ncee/wwc/", domain: "ies.ed.gov" },
];

function response(url, body, status = 200) {
  const result = new Response(body, {
    status,
    headers: { "content-type": "text/xml" },
  });
  Object.defineProperty(result, "url", { value: url });
  return result;
}

afterEach(() => vi.unstubAllGlobals());

describe("education source retrieval", () => {
  it("returns exact official page citations and a relevant short excerpt", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
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
    }));
    const { retrieveEducationEvidence } = await import(
      "../lib/services/education-retrieval.ts"
    );

    const result = await retrieveEducationEvidence("participation", sources);

    expect(result.status).toBe("success");
    expect(result.sources).toHaveLength(4);
    expect(result.sources.every((source) => source.status === "success")).toBe(true);
    expect(result.sources.every((source) => source.page_url?.includes("/resources/participation"))).toBe(true);
    expect(result.sources.every((source) => source.http_status === 200)).toBe(true);
    expect(result.sources.every((source) => source.retrieval_duration_ms >= 0)).toBe(true);
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
    const { retrieveEducationEvidence } = await import(
      "../lib/services/education-retrieval.ts"
    );

    const result = await retrieveEducationEvidence("academic", sources);

    expect(result.status).toBe("no_relevant_results");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.sources.every((source) => source.page_url === null)).toBe(true);
  });

  it("continues retrieving from other sources when one source denies access", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
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
    }));
    const { retrieveEducationEvidence } = await import(
      "../lib/services/education-retrieval.ts"
    );

    const result = await retrieveEducationEvidence("participation", sources);

    expect(result.status).toBe("partial");
    expect(result.sources.find((source) => source.key === "IB")).toMatchObject({
      status: "failed",
      error: "access_restricted",
      http_status: 403,
    });
    expect(result.sources.filter((source) => source.status === "success"))
      .toHaveLength(3);
  });
});
