import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { SuggestTestContext, SuggestTestResult } from "@/lib/mcp-tools/suggestTest";
import {
  EDUCATION_SOURCES,
  retrieveEducationEvidence,
} from "@/lib/services/education-retrieval";
import {
  loadLearnerSuggestionContext,
  loadPreviousSuggestions,
  persistSuggestedProposal,
} from "@/lib/services/suggestion-workflow";

export type SuggestionContextResolver = () =>
  Promise<SuggestTestContext | null>;

const observationSchema = z.object({
  observation_id: z.string(),
  learner_id: z.string(),
  teacher_id: z.string(),
  observation_type: z.enum([
    "participation",
    "academic",
    "behavioral",
    "attendance",
    "extracurricular",
    "test_result",
    "other",
  ]),
  original_observation: z.string(),
  reviewed_observation: z.string().nullable(),
  observation_date: z.string(),
  observed_at: z.union([z.string(), z.date()]),
  activity_context: z.string().nullable(),
  subject: z.string().nullable(),
  term: z.string().nullable(),
  possible_theme: z.string().nullable(),
  teacher_review_status: z.enum([
    "not_required",
    "recorded",
    "confirmed",
    "updated",
  ]),
});

const sourceSchema = z.object({
  key: z.enum(["IB", "EEF", "AMI", "WWC"]),
  name: z.string(),
  url: z.string(),
  status: z.enum(["success", "no_relevant_results", "failed"]),
  retrieved_at: z.string().nullable(),
  title: z.string().nullable(),
  page_url: z.string().nullable(),
  excerpt: z.string().nullable(),
  error: z.enum([
    "timeout",
    "access_restricted",
    "http_error",
    "network_error",
    "discovery_failure",
    "content_extraction_failure",
    "response_too_large",
    "unsupported_content",
    "provider_error",
  ]).nullable(),
  http_status: z.number().nullable(),
  retrieval_duration_ms: z.number().nullable(),
});

const suggestionSchema = z.object({
  ok: z.literal(true),
  status: z.literal("proposed"),
  proposal_id: z.string().regex(/^[a-f0-9]{64}$/),
  learner_id: z.string().min(1),
  exploration_question: z.string().min(1).max(500),
  hypothesis: z.string().min(1).max(1_500),
  reason: z.string().min(1).max(2_000),
  cited_observations: z.array(z.object({
    observation_id: z.string().min(1),
    observation_type: z.string(),
    observed_at: z.string(),
    teacher_id: z.string(),
    subject: z.string().nullable(),
    activity_context: z.string().nullable(),
    content: z.string().min(1),
  })).min(1),
  suggested_activity: z.object({
    title: z.string().min(1).max(200),
    duration_minutes: z.number().int().min(1).max(60),
    purpose: z.string().min(1).max(1_000),
    steps: z.array(z.string().min(1).max(500)).min(2).max(8),
    what_to_observe: z.array(z.string().min(1).max(500)).min(2).max(8),
    intended_outcome: z.string().min(1).max(1_000),
    assessment_criteria: z.array(z.string().min(1).max(500)).min(1).max(6),
  }),
  what_to_log_afterward: z.array(z.string().min(1).max(500)).min(1).max(8),
  grouped_observations: z.array(z.object({
    observation_type: z.string(),
    observation_ids: z.array(z.string()),
    eligible_observation_ids: z.array(z.string()),
    awaiting_review_ids: z.array(z.string()),
  })),
  under_corroborated_signals: z.array(z.object({
    kind: z.enum(["single_observation", "repeated_signal"]),
    observation_type: z.string(),
    possible_theme: z.string().nullable(),
    observation_ids: z.array(z.string()),
    variation_observation_ids: z.array(z.string()),
    distinct_dates: z.number(),
    distinct_teachers: z.number(),
    distinct_contexts: z.number(),
    duplicate_observation_ids: z.array(z.string()),
    status: z.enum(["under_corroborated", "more_corroborated"]),
  })),
  prior_test_ids: z.array(z.string()),
  limitations: z.array(z.string()),
  retrieval_status: z.enum([
    "success",
    "partial",
    "no_relevant_results",
    "failed",
  ]),
  educational_sources: z.array(sourceSchema),
  educational_references: z.array(z.object({
    key: z.string(),
    url: z.string().url(),
    title: z.string(),
  })),
  test_id: z.string().optional(),
  duplicate: z.boolean().optional(),
});

function result(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function failure(code: string, message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: code, message }) }],
    structuredContent: { error: code, message },
    isError: true,
  };
}

function toolErrorCode(error: unknown): string {
  if (error instanceof Error && "status" in error) {
    const status = error.status;
    if (status === 403) return "not_authorized";
    if (status === 404) return "learner_not_found";
    if (status === 409) return "conflict";
  }
  return "suggestion_tool_failed";
}

export function registerSuggestionWorkflowTools(
  server: McpServer,
  resolveContext: SuggestionContextResolver,
): void {
  server.registerTool(
    "get_learner_observations",
    {
      title: "Retrieve authorized learner evidence",
      description:
        "Return reviewed and pending observation records plus grade/stream context for one explicitly selected learner in the trusted teacher's assigned class.",
      inputSchema: {
        learner_id: z.string().trim().min(1).max(200),
      },
    },
    async ({ learner_id }) => {
      try {
        const context = await resolveContext();
        if (!context) {
          return failure("teacher_context_unavailable", "The teacher context is unavailable.");
        }
        const evidence = await loadLearnerSuggestionContext(learner_id, context);
        return result({ ...evidence });
      } catch (error) {
        console.error("Suggest Test MCP tool failed", {
          tool: "get_learner_observations",
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorCode: toolErrorCode(error),
        });
        return failure(toolErrorCode(error), "Dira could not retrieve authorized learner evidence.");
      }
    },
  );

  server.registerTool(
    "get_previous_suggestions",
    {
      title: "Retrieve previous learner suggestions",
      description:
        "Read previous suggested, accepted, and completed activities and their linked observation IDs for the trusted teacher's selected learner.",
      inputSchema: {
        learner_id: z.string().trim().min(1).max(200),
      },
    },
    async ({ learner_id }) => {
      try {
        const context = await resolveContext();
        if (!context) {
          return failure("teacher_context_unavailable", "The teacher context is unavailable.");
        }
        return result({
          suggestions: await loadPreviousSuggestions(learner_id, context),
        });
      } catch (error) {
        console.error("Suggest Test MCP tool failed", {
          tool: "get_previous_suggestions",
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorCode: toolErrorCode(error),
        });
        return failure(toolErrorCode(error), "Dira could not retrieve previous suggestions.");
      }
    },
  );

  server.registerTool(
    "retrieve_education_resources",
    {
      title: "Retrieve approved educational resources",
      description:
        "Discover relevant material from the configured official education-source families using a bounded query derived from selected evidence and grade context.",
      inputSchema: {
        query: z.string().trim().min(1).max(1_500),
      },
    },
    async ({ query }) => {
      const startedAt = Date.now();
      const retrieval = await retrieveEducationEvidence(query, EDUCATION_SOURCES);
      console.info("Suggest Test education retrieval complete", {
        stage: "education_retrieval",
        status: retrieval.status,
        relevantResourceCount: retrieval.sources.filter(
          (source) => source.status === "success",
        ).length,
        durationMs: Date.now() - startedAt,
      });
      return result(retrieval);
    },
  );

  server.registerTool(
    "persist_test_suggestion",
    {
      title: "Persist a validated test suggestion",
      description:
        "Validate and save a generated proposal and its observation citations as SUGGESTED using the existing test lifecycle and submission idempotency.",
      inputSchema: {
        learner_id: z.string().trim().min(1).max(200),
        submission_id: z.string().trim().min(1).max(200),
        supersedes_test_id: z.string().trim().min(1).max(200).optional(),
        suggestion: suggestionSchema,
      },
    },
    async ({ learner_id, submission_id, supersedes_test_id, suggestion }) => {
      try {
        const context = await resolveContext();
        if (!context) {
          return failure("teacher_context_unavailable", "The teacher context is unavailable.");
        }
        if (suggestion.learner_id !== learner_id) {
          return failure("learner_mismatch", "The suggestion does not match the selected learner.");
        }
        const persisted = await persistSuggestedProposal(
          suggestion as Extract<SuggestTestResult, { ok: true }>,
          submission_id,
          context,
          supersedes_test_id,
        );
        return result(persisted);
      } catch (error) {
        console.error("Suggest Test MCP tool failed", {
          tool: "persist_test_suggestion",
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorCode: toolErrorCode(error),
        });
        return failure(toolErrorCode(error), "Dira could not save the test suggestion.");
      }
    },
  );
}

export { suggestionSchema };
