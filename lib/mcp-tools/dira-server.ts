import "server-only";

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import { OBSERVATION_TYPES } from "@/lib/db/schema";
import { logObservation, ObservationError } from "@/lib/mcp-tools/logObservation";
import {
  dispatchOneDueFollowUp,
} from "@/lib/services/follow-up-dispatch";
import {
  listDueFollowUps,
  prepareDailyFollowUpQueue,
} from "@/lib/services/follow-up-queue";
import { buildEvidenceSummary } from "@/lib/services/evidence-summary";
import {
  DraftError,
  saveCallObservationDrafts,
} from "@/lib/services/call-observations";
import {
  suggestTest,
  SuggestionPersistenceError,
} from "@/lib/mcp-tools/suggestTest";
import { registerSuggestionWorkflowTools } from "@/lib/mcp-tools/suggestionWorkflowTools";
import {
  acceptSuggestion,
  regenerateSuggestion,
} from "@/lib/services/suggestion-workflow";

function toolResult(value: unknown) {
  const text = JSON.stringify(value);
  return {
    content: [{ type: "text" as const, text }],
    structuredContent:
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : { value },
  };
}

function toolError(code: string, message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: code, message }) }],
    structuredContent: { error: code, message },
    isError: true,
  };
}

function logToolFailure(tool: string, error: unknown): void {
  console.error("Dira MCP tool failed", {
    tool,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

interface QueueDiagnostic {
  code: string;
  message: string;
  databaseCode?: string;
}

function getQueueDiagnostic(error: unknown): QueueDiagnostic {
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
  const databaseCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined;

  switch (databaseCode) {
    case "42P01":
      return {
        code: "queue_schema_missing",
        message:
          "A required queue table is missing. Check that migration db/002_follow_up_queue.sql has been applied to the database used by Dira.",
        databaseCode,
      };
    case "42703":
      return {
        code: "database_schema_out_of_date",
        message:
          "A required database column is missing. Check that the database schema and migrations match this version of Dira.",
        databaseCode,
      };
    case "3D000":
      return {
        code: "database_not_found",
        message:
          "The configured PostgreSQL database does not exist. Check that DATABASE_URL points to the intended development database.",
        databaseCode,
      };
    case "28P01":
    case "28000":
      return {
        code: "database_authentication_failed",
        message:
          "PostgreSQL rejected the configured database credentials. Check the local database configuration without sharing its values.",
        databaseCode,
      };
    case "08000":
    case "08001":
    case "08003":
    case "08006":
    case "57P01":
      return {
        code: "database_unavailable",
        message:
          "Dira could not maintain a connection to PostgreSQL. Check that the intended database is running and reachable.",
        databaseCode,
      };
    default:
      break;
  }

  if (
    error instanceof Error &&
    error.message === "No schools are configured for follow-up scheduling"
  ) {
    return {
      code: "no_schools_configured",
      message:
        "No school records were found in the configured database. Check that the development data has been loaded.",
    };
  }

  if (error instanceof AggregateError) {
    return {
      code: "queue_transaction_rollback_failed",
      message:
        "Queue preparation failed and PostgreSQL also reported a transaction rollback problem. Check the server log and database health before retrying.",
    };
  }

  if (
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string" &&
      ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH"].includes(
        error.code,
      )) ||
    errorMessage.includes("connection terminated") ||
    errorMessage.includes("timeout")
  ) {
    return {
      code: "database_connection_failed",
      message:
        "Dira could not connect to PostgreSQL in time. Check that the intended development database is running and reachable.",
    };
  }

  return {
    code: "queue_preparation_internal_error",
    message:
      "Queue preparation failed unexpectedly. Check the server log for the diagnostic ID and error category.",
  };
}

function validObservedAt(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function createDiraMcpServer(): McpServer {
  const server = new McpServer(
    { name: "dira", version: "1.0.0" },
    { capabilities: {} },
  );

  registerSuggestionWorkflowTools(server, async () => resolveTeacherContext());

  server.registerTool(
    "prepare_daily_follow_up_queue",
    {
      title: "Prepare today's teacher follow-up queue",
      description:
        "Prepare eligible jobs for the server-resolved demo teacher's school and teacher. This creates database jobs only and never places calls.",
    },
    async () => {
      let stage = "teacher_context_resolution";
      try {
        const context = await resolveTeacherContext();
        if (!context) {
          return toolError("teacher_context_unavailable", "The demo teacher context is unavailable.");
        }

        stage = "queue_preparation";
        const result = await prepareDailyFollowUpQueue(
          new Date(),
          context.school_id,
          context.teacher_id,
        );
        return toolResult(result);
      } catch (error) {
        const diagnostic = getQueueDiagnostic(error);
        const diagnosticId = randomUUID();
        console.error("Dira queue preparation failed", {
          diagnosticId,
          stage,
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorCode: diagnostic.databaseCode ?? diagnostic.code,
        });
        const details = {
          error: diagnostic.code,
          message: `${diagnostic.message} (diagnostic ${diagnosticId})`,
          stage,
          diagnostic_id: diagnosticId,
          ...(diagnostic.databaseCode
            ? { database_code: diagnostic.databaseCode }
            : {}),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(details) }],
          structuredContent: details,
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "list_due_follow_ups",
    {
      title: "List due teacher follow-ups",
      description:
        "List queued follow-up jobs for the server-resolved demo teacher that are scheduled due now. Dispatch rechecks all eligibility rules.",
      inputSchema: {
        limit: z.number().int().min(1).max(20).optional(),
      },
    },
    async ({ limit }) => {
      try {
        const context = await resolveTeacherContext();
        if (!context) {
          return toolError("teacher_context_unavailable", "The demo teacher context is unavailable.");
        }

        const items = await listDueFollowUps(
          context.teacher_id,
          context.school_id,
          new Date(),
          limit ?? 10,
        );
        return toolResult({ items, count: items.length });
      } catch (error) {
        logToolFailure("list_due_follow_ups", error);
        return toolError("due_follow_up_lookup_failed", "Dira could not inspect due follow-ups.");
      }
    },
  );

  server.registerTool(
    "dispatch_one_due_follow_up",
    {
      title: "Dispatch one due teacher follow-up",
      description:
        "Request at most one due call for the server-resolved demo teacher. Server-side schedule, destination, demo-mode, and atomic claim checks remain authoritative.",
    },
    async () => {
      if (
        process.env.NODE_ENV === "production" &&
        process.env.DIRA_DEMO_MODE === "true"
      ) {
        return toolError(
          "operator_dispatch_required",
          "Production demo calls can only be dispatched through the operator-controlled endpoint.",
        );
      }

      try {
        const context = await resolveTeacherContext();
        if (!context) {
          return toolError("teacher_context_unavailable", "The demo teacher context is unavailable.");
        }

        const call = await dispatchOneDueFollowUp(new Date(), context);
        return toolResult({ call });
      } catch (error) {
        logToolFailure("dispatch_one_due_follow_up", error);
        return toolError("dispatch_failed", "Dira could not dispatch a due follow-up.");
      }
    },
  );

  server.registerTool(
    "log_observation",
    {
      title: "Log a teacher observation",
      description:
        "Save teacher-provided observation text for an explicitly selected learner. Does not infer learner identity or rewrite observation content.",
      inputSchema: z.object({
        learner_id: z.string().trim().min(1).max(200),
        observation_type: z.enum(OBSERVATION_TYPES),
        content: z.string().trim().min(1).max(20_000),
        observed_at: z.string().min(1).max(80).refine(validObservedAt),
        submission_id: z.string().trim().min(1).max(200),
        calendar_entry_id: z.string().trim().max(200).optional(),
        subject: z.string().trim().max(200).optional(),
        term: z.string().trim().max(100).optional(),
        activity_context: z.string().trim().max(2_000).optional(),
        linked_test_id: z.string().trim().max(200).optional(),
      }),
    },
    async (input) => {
      try {
        const context = await resolveTeacherContext();
        if (!context) {
          return toolError("teacher_context_unavailable", "The demo teacher context is unavailable.");
        }

        const result = await logObservation(
          {
            ...input,
            capture_method: "text",
          },
          context,
        );
        return toolResult({
          observation_id: result.observation.observation_id,
          duplicate: result.duplicate,
          teacher_review_status: result.observation.teacher_review_status,
        });
      } catch (error) {
        logToolFailure("log_observation", error);
        if (error instanceof ObservationError) {
          return toolError("observation_rejected", error.message);
        }
        return toolError("observation_save_failed", "Dira could not save the observation.");
      }
    },
  );

  server.registerTool(
    "build_evidence_summary",
    {
      title: "Review a learner's evidence card",
      description:
        "Read saved evidence tests and teacher-recorded outcomes for one explicitly selected learner in the server-resolved teacher's assigned classes.",
      inputSchema: {
        learner_id: z.string().trim().min(1).max(200),
      },
    },
    async ({ learner_id }) => {
      try {
        const context = await resolveTeacherContext();
        if (!context) {
          return toolError("teacher_context_unavailable", "The teacher context is unavailable.");
        }
        return toolResult(await buildEvidenceSummary(learner_id, context));
      } catch (error) {
        logToolFailure("build_evidence_summary", error);
        return toolError("evidence_summary_failed", "Dira could not load this learner's evidence.");
      }
    },
  );

  server.registerTool(
    "suggest_test",
    {
      title: "Suggest a learner activity",
      description:
        "Start the bounded LangGraph Suggest Test workflow for one explicitly selected learner. The workflow retrieves authorized evidence and previous suggestions, invokes approved-source retrieval and GLM-5.3, validates the result, and persists a SUGGESTED proposal.",
      inputSchema: {
        learner_id: z.string().trim().min(1).max(200),
        submission_id: z.string().trim().min(1).max(200),
      },
    },
    async ({ learner_id, submission_id }) => {
      try {
        const context = await resolveTeacherContext();
        if (!context) {
          return toolError("teacher_context_unavailable", "The teacher context is unavailable.");
        }
        return toolResult(
          await suggestTest(learner_id, context, { submission_id }),
        );
      } catch (error) {
        logToolFailure("suggest_test", error);
        return toolError("suggestion_failed", "Dira could not prepare a test suggestion.");
      }
    },
  );

  server.registerTool(
    "regenerate_test_suggestion",
    {
      title: "Reject a suggestion and prepare another",
      description:
        "Use the previous persisted SUGGESTED proposal as regeneration context, then run the LangGraph workflow to produce and persist a replacement.",
      inputSchema: {
        learner_id: z.string().trim().min(1).max(200),
        submission_id: z.string().trim().min(1).max(200),
        proposal_id: z.string().regex(/^[a-f0-9]{64}$/),
        supersedes_test_id: z.string().trim().min(1).max(200).optional(),
      },
    },
    async ({ learner_id, submission_id, proposal_id, supersedes_test_id }) => {
      try {
        const context = await resolveTeacherContext();
        if (!context) {
          return toolError("teacher_context_unavailable", "The teacher context is unavailable.");
        }
        return toolResult(
          await regenerateSuggestion(
            { learner_id, submission_id, proposal_id, supersedes_test_id },
            context,
          ),
        );
      } catch (error) {
        logToolFailure("regenerate_test_suggestion", error);
        if (error instanceof SuggestionPersistenceError) {
          return toolError("suggestion_rejected", error.message);
        }
        return toolError("suggestion_regeneration_failed", "Dira could not regenerate this suggestion.");
      }
    },
  );

  server.registerTool(
    "accept_suggested_test",
    {
      title: "Accept a proposed learner activity",
      description:
        "Save a proposed classroom test as ACCEPTED for an explicitly selected learner. A teacher-recorded linked outcome is required before it can become COMPLETED.",
      inputSchema: {
        learner_id: z.string().trim().min(1).max(200),
        submission_id: z.string().trim().min(1).max(200),
        proposal_id: z.string().regex(/^[a-f0-9]{64}$/),
        planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        supersedes_test_id: z.string().trim().min(1).max(200).optional(),
      },
    },
    async (input) => {
      try {
        const context = await resolveTeacherContext();
        if (!context) {
          return toolError("teacher_context_unavailable", "The teacher context is unavailable.");
        }
        return toolResult(await acceptSuggestion(input, context));
      } catch (error) {
        logToolFailure("accept_suggested_test", error);
        if (error instanceof SuggestionPersistenceError) {
          return toolError("suggestion_acceptance_rejected", error.message);
        }
        return toolError("suggestion_acceptance_failed", "Dira could not save the accepted test.");
      }
    },
  );

  server.registerTool(
    "save_call_observation_drafts",
    {
      title: "Save observation drafts from a call transcript",
      description:
        "Save per-learner observation segments quoted from a processed call transcript as teacher-review drafts. Learner matching is done by the server; drafts are never real observations until the teacher confirms them.",
      inputSchema: {
        recording_id: z.string().uuid(),
        segments: z
          .array(
            z.object({
              segment_text: z.string().trim().min(1).max(4000),
              mentioned_name: z.string().trim().max(100).optional(),
              observation_type: z.enum(OBSERVATION_TYPES).optional(),
            }),
          )
          .min(1)
          .max(30),
      },
    },
    async ({ recording_id, segments }) => {
      try {
        return toolResult(await saveCallObservationDrafts(recording_id, segments));
      } catch (error) {
        logToolFailure("save_call_observation_drafts", error);
        if (error instanceof DraftError) {
          return toolError("draft_save_rejected", error.message);
        }
        return toolError("draft_save_failed", "Dira could not save the observation drafts.");
      }
    },
  );

  return server;
}