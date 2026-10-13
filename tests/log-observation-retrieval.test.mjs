import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveTeacherContext: vi.fn(),
}));

vi.mock("../lib/db/client.ts", () => ({
  pool: { query: mocks.query },
}));

vi.mock("../lib/auth/teacher-context.ts", () => ({
  resolveTeacherContext: mocks.resolveTeacherContext,
}));

const { GET } = await import("../app/api/mcp/log-observation/route.ts");

describe("log observation retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTeacherContext.mockResolvedValue({
      teacher_id: "T001",
      school_id: "SCH001",
    });
  });

  it("returns current class observations for a teacher assigned to the learner", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [{ class_id: "C2026-A", academic_year: 2026 }],
      })
      .mockResolvedValueOnce({
        rows: [{
          observation_id: "OBS-VOICE",
          original_observation: "Observed transcript-based note",
          reviewed_observation: null,
          teacher_review_status: "recorded",
          created_at: "2026-10-13T09:12:38.078Z",
        }],
        rowCount: 1,
      });

    const response = await GET(
      new NextRequest("http://localhost/api/mcp/log-observation?learner_id=L003"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      observations: [{ observation_id: "OBS-VOICE", teacher_review_status: "recorded" }],
    });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[1][0]).toContain("class_id = $3");
    expect(mocks.query.mock.calls[1][0]).not.toMatch(/AND teacher_id =/);
    expect(mocks.query.mock.calls[1][1]).toEqual([
      "L003",
      "SCH001",
      "C2026-A",
      2026,
    ]);
  });

  it("does not retrieve observations when the teacher has no current assignment", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const response = await GET(
      new NextRequest("http://localhost/api/mcp/log-observation?learner_id=L003"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Learner is not currently assigned to this teacher",
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("returns a genuine empty list when an assigned learner has no observations", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [{ class_id: "C2026-A", academic_year: 2026 }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await GET(
      new NextRequest("http://localhost/api/mcp/log-observation?learner_id=L003"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ observations: [], count: 0 });
  });
});
