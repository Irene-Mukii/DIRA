import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgentCompletion: vi.fn(),
  buildEvidenceSummary: vi.fn(),
  retrieveEducationEvidence: vi.fn(),
  poolQuery: vi.fn(),
  poolConnect: vi.fn(),
  clientQuery: vi.fn(),
  logToolEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/models", () => ({
  createAgentCompletion: mocks.createAgentCompletion,
  DIRA_AGENT_MODEL: "glm-5.3-flash",
  GlmConfigurationError: class GlmConfigurationError extends Error {},
  GlmRequestError: class GlmRequestError extends Error {},
}));
vi.mock("@/lib/services/evidence-summary", () => ({
  buildEvidenceSummary: mocks.buildEvidenceSummary,
  EvidenceSummaryNotFoundError: class EvidenceSummaryNotFoundError extends Error {},
}));
vi.mock("@/lib/services/education-retrieval", () => ({
  EDUCATION_SOURCES: [{
    key: "EEF",
    name: "Education Endowment Foundation",
    url: "https://educationendowmentfoundation.org.uk/",
    domain: "educationendowmentfoundation.org.uk",
  }],
  retrieveEducationEvidence: mocks.retrieveEducationEvidence,
}));
vi.mock("@/lib/db/client", () => ({
  pool: {
    query: mocks.poolQuery,
    connect: mocks.poolConnect,
  },
}));
vi.mock("@/lib/agent/logger", () => ({
  createRunId: () => "11111111-1111-4111-8111-111111111111",
  logToolEvent: mocks.logToolEvent,
}));

import {
  assessHypothesis,
  generateEvidenceSummary,
} from "../lib/services/evidence-reasoning.ts";

const context = { teacher_id: "T001", school_id: "S001" };
const source = {
  key: "EEF",
  name: "Education Endowment Foundation",
  url: "https://educationendowmentfoundation.org.uk/",
  status: "success",
  retrieved_at: "2026-10-13T08:00:00.000Z",
  title: "Structured discussion",
  page_url: "https://educationendowmentfoundation.org.uk/discussion",
  excerpt: "Structured discussion supports opportunities to share ideas.",
  error: null,
  http_status: 200,
  retrieval_duration_ms: 12,
};

function evidenceSnapshot(overrides = {}) {
  return {
    learner: {
      learner_id: "L001",
      display_name: "Learner One",
      grade_level: "Grade 5",
      stream_label: "Blue",
      academic_year: 2026,
    },
    observations: [{
      observation_id: "OBS001",
      observation_type: "participation",
      original_observation: "Shared an idea with a partner.",
      reviewed_observation: null,
      observed_at: new Date("2026-10-01T08:00:00Z"),
      teacher_id: "T001",
      teacher_review_status: "confirmed",
      subject: "Mathematics",
      activity_context: "Partner discussion",
    }],
    tests: [{
      test_id: "TEST001",
      supersedes_test_id: null,
      status: "COMPLETED",
      exploration_question: "What discussion format supports sharing ideas?",
      hypothesis: "The learner may share an idea after partner discussion.",
      suggested_activity: "Partner discussion followed by optional group sharing.",
      activity_date: "2026-10-01",
      purpose: "Explore participation in a classroom setting.",
      estimated_minutes: 15,
      what_to_observe: ["Whether the learner shares an idea."],
      what_to_log_after: ["Record the setting and support."],
      limitations: ["One activity only."],
      retrieval_status: "success",
      educational_sources: [source],
      outcome_observation_id: "OUT001",
      observed_outcome: "Shared one idea after discussing with a partner.",
      cited_observations: [{
        observation_id: "OBS001",
        observation_type: "participation",
        original_observation: "Shared an idea with a partner.",
        reviewed_observation: null,
        observed_at: new Date("2026-10-01T08:00:00Z"),
        teacher_id: "T001",
        teacher_review_status: "confirmed",
        citation_role: "context",
      }],
    }],
    test_count: 1,
    ...overrides,
  };
}

function summaryOutput(refs = ["OBS001", "TEST001"]) {
  return {
    summary: "The learner shared an idea after partner discussion in one activity.",
    observed_facts: [{
      statement: "The learner shared an idea with a partner.",
      evidence_refs: refs,
    }],
    tentative_interpretations: [],
    conflicting_evidence: [],
    gaps: [],
    limitations: ["This reflects a single recorded context."],
  };
}

function assessmentOutput(overrides = {}) {
  return {
    classification: "SUPPORTS",
    rationale: "The recorded outcome matches the stated hypothesis in this activity.",
    evidence_refs: ["OUT001", "OBS001"],
    research_refs: ["EEF"],
    uncertainty: ["This describes one activity only."],
    limitations: ["The result does not establish a general learner characteristic."],
    next_information_needed: ["Observe the same activity in another context."],
    change_explanation: "",
    ...overrides,
  };
}

function savedAssessment() {
  return {
    assessment_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    test_id: "TEST001",
    learner_id: "L001",
    version: 1,
    previous_assessment_id: null,
    classification: "SUPPORTS",
    rationale: "The recorded outcome matches the hypothesis in this activity.",
    uncertainty: ["This describes one activity only."],
    limitations: ["No general conclusion is established."],
    next_information_needed: ["Observe a second context."],
    evidence_references: ["OUT001", "OBS001"],
    research_references: [{
      key: "EEF",
      name: "Education Endowment Foundation",
      url: "https://educationendowmentfoundation.org.uk/",
      title: "Structured discussion",
      page_url: "https://educationendowmentfoundation.org.uk/discussion",
    }],
    research_retrieval_status: "success",
    assessed_at: new Date("2026-10-14T08:00:00Z"),
    model: "glm-5.3-flash",
    prompt_version: "evidence-reasoning-v1",
    assessment_trigger: "initial",
    change_explanation: "",
    status: "CURRENT",
  };
}

beforeEach(() => {
  mocks.buildEvidenceSummary.mockResolvedValue(evidenceSnapshot());
  mocks.retrieveEducationEvidence.mockResolvedValue({
    status: "success",
    sources: [source],
  });
  mocks.createAgentCompletion.mockImplementation(async () => ({
    content: JSON.stringify(summaryOutput()),
    toolCalls: [],
  }));
  mocks.poolQuery.mockResolvedValue({ rows: [] });
  mocks.clientQuery.mockImplementation(async (query) => {
    const sql = String(query);
    if (sql.includes("FROM activity_tests t")) {
      return {
        rows: [{
          test_id: "TEST001",
          learner_id: "L001",
          hypothesis: "The learner may share an idea after partner discussion.",
          outcome_observation_id: "OUT001",
          observed_outcome: "Shared one idea after discussing with a partner.",
        }],
      };
    }
    if (sql.includes("FROM hypothesis_assessments") && sql.includes("FOR UPDATE")) {
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO hypothesis_assessments")) {
      return { rows: [savedAssessment()] };
    }
    return { rows: [] };
  });
  mocks.poolConnect.mockResolvedValue({
    query: mocks.clientQuery,
    release: vi.fn(),
  });
  mocks.logToolEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("evidence reasoning", () => {
  it("generates a summary once for concurrent duplicate page requests", async () => {
    let resolveModel;
    mocks.createAgentCompletion.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveModel = resolve;
        }),
    );

    const first = generateEvidenceSummary("L001", context);
    const second = generateEvidenceSummary("L001", context);
    expect(second).toBe(first);
    await vi.waitFor(() => expect(mocks.createAgentCompletion).toHaveBeenCalledOnce());
    resolveModel({ content: JSON.stringify(summaryOutput()), toolCalls: [] });

    await expect(first).resolves.toMatchObject({
      summary: expect.stringContaining("partner discussion"),
      model: "glm-5.3-flash",
    });
    expect(mocks.buildEvidenceSummary).toHaveBeenCalledOnce();
  });

  it("retries one invalid evidence citation and accepts only supplied references", async () => {
    mocks.createAgentCompletion
      .mockResolvedValueOnce({
        content: JSON.stringify(summaryOutput(["UNKNOWN"])),
        toolCalls: [],
      })
      .mockResolvedValueOnce({
        content: JSON.stringify(summaryOutput()),
        toolCalls: [],
      });

    await expect(generateEvidenceSummary("L001", context)).resolves.toMatchObject({
      observed_facts: [{ evidence_refs: ["OBS001", "TEST001"] }],
    });
    expect(mocks.createAgentCompletion).toHaveBeenCalledTimes(2);
  });

  it("does not call the model or retrieval when the test has no recorded outcome", async () => {
    mocks.buildEvidenceSummary.mockResolvedValue(
      evidenceSnapshot({
        tests: [{
          ...evidenceSnapshot().tests[0],
          status: "ACCEPTED",
          outcome_observation_id: null,
          observed_outcome: null,
        }],
      }),
    );

    await expect(assessHypothesis("L001", "TEST001", context)).resolves.toEqual({
      status: "not_assessable_yet",
      reason: "outcome_not_recorded",
      message: "This activity has no teacher-recorded outcome yet.",
    });
    expect(mocks.createAgentCompletion).not.toHaveBeenCalled();
    expect(mocks.retrieveEducationEvidence).not.toHaveBeenCalled();
    expect(mocks.poolConnect).not.toHaveBeenCalled();
  });

  it("persists a validated assessment with its real evidence and source references", async () => {
    mocks.createAgentCompletion.mockResolvedValue({
      content: JSON.stringify(assessmentOutput()),
      toolCalls: [],
    });

    await expect(assessHypothesis("L001", "TEST001", context)).resolves.toMatchObject({
      status: "assessed",
      assessment: {
        version: 1,
        classification: "SUPPORTS",
        trigger: "initial",
        research_retrieval_status: "success",
        evidence_references: ["OUT001", "OBS001"],
      },
    });
    const insert = mocks.clientQuery.mock.calls.find(([query]) =>
      String(query).includes("INSERT INTO hypothesis_assessments"),
    );
    expect(insert).toBeDefined();
    expect(JSON.parse(insert[1][9])).toEqual(["OUT001", "OBS001"]);
    expect(JSON.parse(insert[1][10])).toContainEqual({
      key: "EEF",
      name: "Education Endowment Foundation",
      url: "https://educationendowmentfoundation.org.uk/",
      title: "Structured discussion",
      page_url: "https://educationendowmentfoundation.org.uk/discussion",
    });
    expect(mocks.clientQuery.mock.calls.some(([query]) =>
      String(query).includes("COMMIT"),
    )).toBe(true);
  });

  it("fails explicitly when the model fabricates assessment evidence references", async () => {
    mocks.createAgentCompletion
      .mockResolvedValueOnce({
        content: JSON.stringify(assessmentOutput({ evidence_refs: ["OTHER"] })),
        toolCalls: [],
      })
      .mockResolvedValueOnce({
        content: JSON.stringify(assessmentOutput({ evidence_refs: ["OTHER"] })),
        toolCalls: [],
      });

    await expect(assessHypothesis("L001", "TEST001", context)).rejects.toMatchObject({
      code: "INVALID_MODEL_OUTPUT",
      httpStatus: 502,
      retryable: true,
    });
    expect(mocks.createAgentCompletion).toHaveBeenCalledTimes(2);
    expect(mocks.poolConnect).not.toHaveBeenCalled();
  });
});
