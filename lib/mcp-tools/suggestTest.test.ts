import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSuggestion,
  findUnderCorroboratedSignals,
  groupObservationsByType,
  type PriorTestRow,
  type SuggestionObservation,
} from "./suggestTest";

function observation(
  observation_id: string,
  overrides: Partial<SuggestionObservation> = {},
): SuggestionObservation {
  const observedAt = overrides.observed_at ?? new Date("2026-05-04T09:00:00Z");
  return {
    observation_id,
    learner_id: "L001",
    teacher_id: "T001",
    observation_type: "participation",
    original_observation: "Contributed an idea during the group task.",
    reviewed_observation: null,
    observation_date: observedAt instanceof Date
      ? observedAt.toISOString().slice(0, 10)
      : observedAt.slice(0, 10),
    observed_at: observedAt,
    activity_context: "Group task",
    subject: "Mathematics",
    term: "Term 2",
    possible_theme: "Participation",
    teacher_review_status: "confirmed",
    ...overrides,
  };
}

const noPriorTests: PriorTestRow[] = [];

test("returns insufficient evidence when an enrolled learner has no observations", () => {
  const result = buildSuggestion("L001", [], noPriorTests);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, "insufficient_evidence");
});

test("groups all observations by type and separates records awaiting review", () => {
  const rows = [
    observation("OBS001"),
    observation("OBS002", { observation_type: "academic", teacher_review_status: "recorded" }),
  ];
  const groups = groupObservationsByType(rows);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.find((group) => group.observation_type === "participation")?.eligible_observation_ids, ["OBS001"]);
  assert.deepEqual(groups.find((group) => group.observation_type === "academic")?.awaiting_review_ids, ["OBS002"]);
});

test("does not suggest from observations that are all awaiting review", () => {
  const result = buildSuggestion("L001", [
    observation("OBS001", { teacher_review_status: "recorded" }),
    observation("OBS002", {
      teacher_review_status: "recorded",
      observed_at: new Date("2026-05-12T09:00:00Z"),
    }),
  ], noPriorTests);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, "needs_review");
});

test("flags exact duplicate notes and cites only the distinct, real observations", () => {
  const rows = [
    observation("OBS001"),
    observation("OBS002"),
    observation("OBS003", {
      teacher_id: "T002",
      observed_at: new Date("2026-05-12T09:00:00Z"),
    }),
  ];
  const signals = findUnderCorroboratedSignals(rows);
  const signal = signals.find((item) => item.observation_type === "participation");

  assert.ok(signal);
  assert.equal(signal.status, "under_corroborated");
  assert.deepEqual(signal.duplicate_observation_ids, ["OBS002"]);

  const result = buildSuggestion("L001", rows, noPriorTests);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(
      result.cited_observations.map((citation) => citation.observation_id),
      ["OBS001", "OBS003"],
    );
    assert.ok(result.hypothesis.length > 0);
    assert.ok(result.suggested_activity.duration_minutes <= 15);
    assert.ok(result.what_to_log_afterward.length > 0);
  }
});

test("returns a single observation as thin evidence instead of hiding it", () => {
  const signals = findUnderCorroboratedSignals([observation("OBS001")]);

  assert.equal(signals.length, 1);
  assert.equal(signals[0].kind, "single_observation");
  assert.equal(signals[0].status, "under_corroborated");
});

test("marks repeated dates from one teacher as under-corroborated", () => {
  const signals = findUnderCorroboratedSignals([
    observation("OBS001"),
    observation("OBS002", {
      observed_at: new Date("2026-05-12T09:00:00Z"),
      observation_date: "2026-05-12",
    }),
  ]);

  assert.equal(signals[0].distinct_dates, 2);
  assert.equal(signals[0].distinct_teachers, 1);
  assert.equal(signals[0].status, "under_corroborated");
});

test("recognizes broader corroboration across teachers, dates, and contexts", () => {
  const signals = findUnderCorroboratedSignals([
    observation("OBS001"),
    observation("OBS002", {
      teacher_id: "T002",
      observed_at: new Date("2026-05-12T09:00:00Z"),
      observation_date: "2026-05-12",
      activity_context: "Pair explanation",
    }),
    observation("OBS003", {
      teacher_id: "T001",
      observed_at: new Date("2026-05-20T09:00:00Z"),
      observation_date: "2026-05-20",
      activity_context: "Independent reflection",
    }),
  ]);

  assert.equal(signals[0].distinct_dates, 3);
  assert.equal(signals[0].distinct_teachers, 2);
  assert.equal(signals[0].distinct_contexts, 3);
  assert.equal(signals[0].status, "more_corroborated");
});

test("does not call the same event a duplicate when a different teacher records it", () => {
  const signals = findUnderCorroboratedSignals([
    observation("OBS001"),
    observation("OBS002", { teacher_id: "T002" }),
  ]);

  assert.equal(signals[0].duplicate_observation_ids.length, 0);
  assert.deepEqual(signals[0].observation_ids, ["OBS001", "OBS002"]);
});

test("deduplicates repeated observation IDs in groups and citations", () => {
  const rows = [
    observation("OBS001"),
    observation("OBS001", { original_observation: "Duplicate payload for the same source ID." }),
    observation("OBS002", {
      observed_at: new Date("2026-05-12T09:00:00Z"),
      observation_date: "2026-05-12",
    }),
  ];
  const result = buildSuggestion("L001", rows, noPriorTests);

  assert.equal(result.grouped_observations[0].observation_ids.filter((id) => id === "OBS001").length, 1);
  if (result.ok) {
    assert.equal(result.cited_observations.filter((item) => item.observation_id === "OBS001").length, 1);
  } else {
    assert.fail("Expected a suggestion from two distinct dated observations.");
  }
});

test("retains different reports instead of discarding apparent contradictions", () => {
  const rows = [
    observation("OBS001", { original_observation: "Contributed several ideas during group work." }),
    observation("OBS002", {
      original_observation: "Stayed quiet during group work unless invited to share.",
      teacher_id: "T002",
      observed_at: new Date("2026-05-12T09:00:00Z"),
    }),
  ];

  const result = buildSuggestion("L001", rows, noPriorTests);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.cited_observations.map((item) => item.observation_id), ["OBS001", "OBS002"]);
    assert.deepEqual(result.under_corroborated_signals[0].variation_observation_ids, ["OBS001", "OBS002"]);
    assert.match(result.limitations.join(" "), /cannot establish a stable learner characteristic/i);
  }
});

test("does not repeat a suggestion while an open test already cites the signal", () => {
  const rows = [
    observation("OBS001"),
    observation("OBS002", { observed_at: new Date("2026-05-12T09:00:00Z") }),
  ];
  const priorTests: PriorTestRow[] = [{
    test_id: "TEST001",
    suggested_activity: "Rotating-role group challenge",
    activity_date: "2026-05-13",
    status: "In progress",
    evidence_ids: ["OBS001"],
  }];
  const result = buildSuggestion("L001", rows, priorTests);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, "insufficient_evidence");
});

test("does not invent an activity for an unmapped observation type", () => {
  const rows = [
    observation("OBS001", { observation_type: "attendance", possible_theme: "Attendance" }),
    observation("OBS002", {
      observation_type: "attendance",
      possible_theme: "Attendance",
      observed_at: new Date("2026-05-12T09:00:00Z"),
    }),
  ];
  const result = buildSuggestion("L001", rows, noPriorTests);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, "no_suitable_activity");
});

test("handles paraphrased duplicates as distinct observations", () => {
  const rows = [
    observation("OBS001", { original_observation: "Organized the group activity and assigned roles." }),
    observation("OBS002", {
      original_observation: "Led the group task by giving everyone a role.",
      teacher_id: "T002",
      observed_at: new Date("2026-05-12T09:00:00Z"),
    }),
    observation("OBS003", {
      original_observation: "Took charge of the group and delegated tasks.",
      observed_at: new Date("2026-05-20T09:00:00Z"),
    }),
  ];
  const signals = findUnderCorroboratedSignals(rows);
  const signal = signals.find((item) => item.observation_type === "participation");

  assert.ok(signal);
  assert.equal(signal.duplicate_observation_ids.length, 0);
  assert.equal(signal.observation_ids.length, 3);
  assert.equal(signal.variation_observation_ids.length, 3);
});

test("handles inconsistent date formats in observations", () => {
  const rows = [
    observation("OBS001", { observed_at: "2026-05-04T09:00:00Z" }),
    observation("OBS002", { observed_at: "2026-05-12T09:00:00Z" }),
    observation("OBS003", { observed_at: new Date("2026-05-20T09:00:00Z") }),
  ];
  const signals = findUnderCorroboratedSignals(rows);
  const signal = signals.find((item) => item.observation_type === "participation");

  assert.ok(signal);
  assert.equal(signal.distinct_dates, 3);
});

test("handles missing teacher_review_status gracefully", () => {
  const rows = [
    observation("OBS001", { teacher_review_status: "not_required" as const }),
    observation("OBS002", {
      teacher_review_status: "confirmed" as const,
      observed_at: new Date("2026-05-12T09:00:00Z"),
    }),
  ];
  const groups = groupObservationsByType(rows);
  const participationGroup = groups.find((g) => g.observation_type === "participation");

  assert.ok(participationGroup);
  assert.deepEqual(participationGroup.eligible_observation_ids.sort(), ["OBS001", "OBS002"]);
  assert.deepEqual(participationGroup.awaiting_review_ids, []);
});

test("handles null and empty activity_context variations", () => {
  const rows = [
    observation("OBS001", { activity_context: "Group task" }),
    observation("OBS002", {
      activity_context: "group task",
      observed_at: new Date("2026-05-12T09:00:00Z"),
    }),
    observation("OBS003", {
      activity_context: null,
      observed_at: new Date("2026-05-20T09:00:00Z"),
    }),
    observation("OBS004", {
      activity_context: "",
      observed_at: new Date("2026-05-25T09:00:00Z"),
    }),
  ];
  const signals = findUnderCorroboratedSignals(rows);
  const signal = signals.find((item) => item.observation_type === "participation");

  assert.ok(signal);
  assert.equal(signal.distinct_contexts, 1);
});

test("verifies historical evidence is not excluded by current-year filter logic", () => {
  const priorYearObs = observation("OBS001", {
    observed_at: new Date("2025-05-04T09:00:00Z"),
    observation_date: "2025-05-04",
  });
  const currentYearObs = observation("OBS002", {
    observed_at: new Date("2026-05-04T09:00:00Z"),
    observation_date: "2026-05-04",
  });
  const rows = [priorYearObs, currentYearObs];

  const signals = findUnderCorroboratedSignals(rows);
  const signal = signals.find((item) => item.observation_type === "participation");

  assert.ok(signal);
  assert.equal(signal.distinct_dates, 2);
  assert.deepEqual(signal.observation_ids.sort(), ["OBS001", "OBS002"]);
});
