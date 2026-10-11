import { describe, expect, it } from "vitest";
import { buildSuggestion } from "../lib/mcp-tools/suggestTest.ts";

function observation(observationId, overrides = {}) {
  const observedAt = overrides.observed_at ?? new Date("2026-05-04T09:00:00Z");
  return {
    observation_id: observationId,
    learner_id: "L001",
    teacher_id: "T001",
    observation_type: "participation",
    original_observation: "Contributed an idea during the group task.",
    reviewed_observation: null,
    observation_date: observedAt instanceof Date ? observedAt.toISOString().slice(0, 10) : observedAt.slice(0, 10),
    observed_at: observedAt,
    activity_context: "Group task",
    subject: "Mathematics",
    term: "Term 2",
    possible_theme: "Participation",
    teacher_review_status: "confirmed",
    ...overrides,
  };
}

const rows = [
  observation("OBS001"),
  observation("OBS002", {
    observed_at: new Date("2026-05-12T09:00:00Z"),
    observation_date: "2026-05-12",
  }),
];

describe("deterministic evidence test suggestions", () => {
  it("returns an unsaved proposal with citations for reviewed evidence", () => {
    const result = buildSuggestion("L001", rows, []);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("proposed");
    expect(result.cited_observations.map((item) => item.observation_id)).toEqual([
      "OBS001",
      "OBS002",
    ]);
    expect(result.suggested_activity.duration_minutes).toBeLessThanOrEqual(15);
  });

  it("selects an alternate activity after a rejected SUGGESTED test", () => {
    const prior = [{
      test_id: "TEST001",
      suggested_activity: "Rotating-role group challenge",
      activity_date: "2026-05-13",
      status: "SUGGESTED",
      evidence_ids: ["OBS001", "OBS002"],
    }];
    const first = buildSuggestion("L001", rows, []);
    const regenerated = buildSuggestion("L001", rows, prior);

    expect(first.ok).toBe(true);
    expect(regenerated.ok).toBe(true);
    if (!first.ok || !regenerated.ok) return;
    expect(regenerated.suggested_activity.title).not.toBe(
      first.suggested_activity.title,
    );
  });

  it("does not offer another test while cited evidence is in an ACCEPTED test", () => {
    const accepted = [{
      test_id: "TEST002",
      suggested_activity: "Rotating-role group challenge",
      activity_date: "2026-05-13",
      status: "ACCEPTED",
      evidence_ids: ["OBS001"],
    }];
    const result = buildSuggestion("L001", rows, accepted);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("insufficient_evidence");
  });
});
