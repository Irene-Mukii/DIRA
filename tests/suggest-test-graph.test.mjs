import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgentCompletion: vi.fn(),
  loadLearnerSuggestionContext: vi.fn(),
  loadPreviousSuggestions: vi.fn(),
  persistSuggestedProposal: vi.fn(),
  retrieveEducationEvidence: vi.fn(),
}));

vi.mock("@/lib/models", () => ({
  createAgentCompletion: mocks.createAgentCompletion,
  DIRA_AGENT_MODEL: "glm-5.3-flash",
}));

vi.mock("@/lib/services/suggestion-workflow", () => ({
  loadLearnerSuggestionContext: mocks.loadLearnerSuggestionContext,
  loadPreviousSuggestions: mocks.loadPreviousSuggestions,
  persistSuggestedProposal: mocks.persistSuggestedProposal,
}));

vi.mock("@/lib/services/education-retrieval", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    retrieveEducationEvidence: mocks.retrieveEducationEvidence,
  };
});

vi.mock("@/lib/db/client", () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

import { runSuggestTestGraph } from "../lib/agent/suggest-test-graph.ts";
import { createDiraMcpServer } from "../lib/mcp-tools/dira-server.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const context = { teacher_id: "T001", school_id: "S001" };
const observations = [
  {
    observation_id: "OBS001",
    learner_id: "L001",
    teacher_id: "T001",
    observation_type: "participation",
    original_observation: "Shared an idea during a group task.",
    reviewed_observation: null,
    observation_date: "2026-05-04",
    observed_at: "2026-05-04T09:00:00.000Z",
    activity_context: "Group task",
    subject: "Mathematics",
    term: "Term 2",
    possible_theme: "Participation",
    teacher_review_status: "confirmed",
  },
  {
    observation_id: "OBS002",
    learner_id: "L001",
    teacher_id: "T001",
    observation_type: "participation",
    original_observation: "Added an idea after partner discussion.",
    reviewed_observation: null,
    observation_date: "2026-05-12",
    observed_at: "2026-05-12T09:00:00.000Z",
    activity_context: "Partner discussion",
    subject: "Mathematics",
    term: "Term 2",
    possible_theme: "Participation",
    teacher_review_status: "confirmed",
  },
];

const source = {
  key: "EEF",
  name: "Education Endowment Foundation",
  url: "https://educationendowmentfoundation.org.uk/",
  status: "success",
  retrieved_at: "2026-05-13T09:00:00.000Z",
  title: "Structured classroom discussion",
  page_url: "https://educationendowmentfoundation.org.uk/resources/discussion",
  excerpt: "Structured discussion can support participation in classroom tasks.",
  error: null,
  http_status: 200,
  retrieval_duration_ms: 12,
};

function generatedActivity(referenceKeys = ["EEF"]) {
  return {
    exploration_question: "What discussion format supports sharing ideas?",
    hypothesis: "The learner may share ideas in more than one group arrangement.",
    reason: "Two reviewed observations describe different classroom contexts.",
    suggested_activity: {
      title: "Partner-to-group idea share",
      duration_minutes: 15,
      purpose: "Explore how a brief partner discussion affects idea sharing.",
      steps: [
        "Give learners a short familiar problem.",
        "Invite partner discussion before optional group sharing.",
      ],
      what_to_observe: [
        "Whether the learner shares an idea with a partner.",
        "Whether the learner chooses to share with the group.",
      ],
      intended_outcome: "Compare contribution across two discussion formats.",
      assessment_criteria: ["Record the contribution format and any support offered."],
    },
    what_to_log_afterward: ["Record the setting, learner choice, and support offered."],
    educational_reference_keys: referenceKeys,
  };
}

function completion(value) {
  return { content: JSON.stringify(value) };
}

beforeEach(() => {
  mocks.loadLearnerSuggestionContext.mockResolvedValue({
    grade_level: "Grade 5",
    stream_label: "Blue",
    observations,
  });
  mocks.loadPreviousSuggestions.mockResolvedValue([]);
  mocks.retrieveEducationEvidence.mockResolvedValue({
    status: "success",
    sources: [source],
  });
  mocks.persistSuggestedProposal.mockImplementation(async (suggestion) => ({
    suggestion: { ...suggestion, test_id: "TEST-001" },
    duplicate: false,
  }));
  mocks.createAgentCompletion.mockResolvedValue(completion(generatedActivity()));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("LangGraph Suggest Test workflow", () => {
  it("uses the in-process MCP evidence, history, retrieval, and persistence tools with retrieved context", async () => {
    const result = await runSuggestTestGraph("L001", context, {
      submission_id: "SUB-001",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.test_id).toBe("TEST-001");
    expect(mocks.loadLearnerSuggestionContext).toHaveBeenCalledWith("L001", context);
    expect(mocks.loadPreviousSuggestions).toHaveBeenCalledWith("L001", context);
    expect(mocks.retrieveEducationEvidence).toHaveBeenCalledOnce();
    expect(mocks.persistSuggestedProposal).toHaveBeenCalledOnce();
    const [messages] = mocks.createAgentCompletion.mock.calls[0];
    expect(messages[1].content).toContain(source.excerpt);
    expect(result.educational_references).toEqual([{
      key: "EEF",
      url: source.page_url,
      title: source.title,
    }]);
  });

  it("retries once when a generated citation is not among retrieved sources", async () => {
    mocks.createAgentCompletion
      .mockResolvedValueOnce(completion(generatedActivity(["WWC"])))
      .mockResolvedValueOnce(completion(generatedActivity([])));

    const result = await runSuggestTestGraph("L001", context, {
      submission_id: "SUB-RETRY",
    });

    expect(result.ok).toBe(true);
    expect(mocks.createAgentCompletion).toHaveBeenCalledTimes(2);
    expect(mocks.persistSuggestedProposal).toHaveBeenCalledOnce();
    expect(mocks.createAgentCompletion.mock.calls[1][0][1].content)
      .toContain("unavailable education source");
  });

  it("never persists when output remains invalid after the bounded retry", async () => {
    mocks.createAgentCompletion.mockResolvedValue(
      completion(generatedActivity(["WWC"])),
    );

    const result = await runSuggestTestGraph("L001", context, {
      submission_id: "SUB-INVALID",
    });

    expect(result.ok).toBe(false);
    expect(mocks.createAgentCompletion).toHaveBeenCalledTimes(2);
    expect(mocks.persistSuggestedProposal).not.toHaveBeenCalled();
  });

  it("registers exactly thirteen public Dira MCP tools", async () => {
    const server = createDiraMcpServer();
    const client = new Client(
      { name: "dira-mcp-inventory-test", version: "1.0.0" },
      { capabilities: {} },
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(13);
      expect(tools.tools.map((tool) => tool.name)).toContain(
        "retrieve_education_resources",
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
});
