import "server-only";

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

function validObservedAt(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function createDiraMcpServer(): McpServer {
  const server = new McpServer(
    { name: "dira", version: "1.0.0" },
    { capabilities: {} },
  );

  server.registerTool(
    "prepare_daily_follow_up_queue",
    {
      title: "Prepare today's teacher follow-up queue",
      description:
        "Prepare eligible jobs for the server-resolved demo teacher's school and teacher. This creates database jobs only and never places calls.",
    },
    async () => {
      try {
        const context = await resolveTeacherContext();
        if (!context) {
          return toolError("teacher_context_unavailable", "The demo teacher context is unavailable.");
        }

        const result = await prepareDailyFollowUpQueue(
          new Date(),
          context.school_id,
          context.teacher_id,
        );
        return toolResult(result);
      } catch (error) {
        logToolFailure("prepare_daily_follow_up_queue", error);
        return toolError("queue_preparation_failed", "Dira could not prepare the follow-up queue.");
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

  return server;
}
