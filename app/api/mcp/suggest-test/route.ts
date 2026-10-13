import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import {
  suggestTest,
  SuggestionPersistenceError,
} from "@/lib/mcp-tools/suggestTest";
import {
  acceptSuggestion,
  regenerateSuggestion,
} from "@/lib/services/suggestion-workflow";

export const runtime = "nodejs";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suggest"),
    learner_id: z.string().trim().min(1).max(200),
    submission_id: z.string().trim().min(1).max(200),
  }),
  z.object({
    action: z.literal("accept"),
    learner_id: z.string().trim().min(1).max(200),
    submission_id: z.string().trim().min(1).max(200),
    proposal_id: z.string().regex(/^[a-f0-9]{64}$/),
    planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    supersedes_test_id: z.string().trim().min(1).max(200).optional(),
  }),
  z.object({
    action: z.literal("regenerate"),
    learner_id: z.string().trim().min(1).max(200),
    submission_id: z.string().trim().min(1).max(200),
    proposal_id: z.string().regex(/^[a-f0-9]{64}$/),
    supersedes_test_id: z.string().trim().min(1).max(200).optional(),
  }),
]);

export async function POST(request: NextRequest) {
  const context = await resolveTeacherContext();
  if (!context) {
    return NextResponse.json(
      { error: "An authenticated teacher context is required" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid suggestion request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const input = parsed.data;
    if (input.action === "suggest") {
      return NextResponse.json(
        await suggestTest(input.learner_id, context, {
          submission_id: input.submission_id,
        }),
      );
    }
    if (input.action === "regenerate") {
      return NextResponse.json(
        await regenerateSuggestion(
          {
            learner_id: input.learner_id,
            submission_id: input.submission_id,
            proposal_id: input.proposal_id,
            supersedes_test_id: input.supersedes_test_id,
          },
          context,
        ),
      );
    }
    return NextResponse.json(
      await acceptSuggestion(
        {
          learner_id: input.learner_id,
          submission_id: input.submission_id,
          planned_date: input.planned_date,
          proposal_id: input.proposal_id,
          supersedes_test_id: input.supersedes_test_id,
        },
        context,
      ),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SuggestionPersistenceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Evidence test suggestion request failed:", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Evidence test suggestion request failed" },
      { status: 500 },
    );
  }
}
