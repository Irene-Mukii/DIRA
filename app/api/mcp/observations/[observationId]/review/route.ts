import { NextRequest, NextResponse } from "next/server";
import { OBSERVATION_TYPES, type ReviewObservationInput } from "@/lib/db/schema";
import { ObservationError } from "@/lib/mcp-tools/logObservation";
import { reviewObservation } from "@/lib/services/observation-review";

export const runtime = "nodejs";

function demoContext() {
  if (process.env.NODE_ENV === "production") return null;
  const teacher_id = process.env.DIRA_DEMO_TEACHER_ID?.trim();
  const school_id = process.env.DIRA_DEMO_SCHOOL_ID?.trim();
  return teacher_id && school_id ? { teacher_id, school_id } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInput(value: unknown): ReviewObservationInput {
  if (!isRecord(value)) {
    throw new ObservationError("Request body must be a JSON object", 400);
  }
  if (typeof value.submission_id !== "string") {
    throw new ObservationError("submission_id must be a string", 400);
  }
  if (value.review_status !== "confirmed" && value.review_status !== "updated") {
    throw new ObservationError("review_status must be confirmed or updated", 400);
  }
  if (value.content !== undefined && typeof value.content !== "string") {
    throw new ObservationError("content must be a string", 400);
  }
  if (
    value.observation_type !== undefined &&
    (typeof value.observation_type !== "string" ||
      !(OBSERVATION_TYPES as readonly string[]).includes(value.observation_type))
  ) {
    throw new ObservationError("Invalid observation_type", 400);
  }
  if (
    value.linked_test_id !== undefined &&
    value.linked_test_id !== null &&
    typeof value.linked_test_id !== "string"
  ) {
    throw new ObservationError("linked_test_id must be a string or null", 400);
  }

  return {
    submission_id: value.submission_id,
    review_status: value.review_status,
    ...(typeof value.content === "string" ? { content: value.content } : {}),
    ...(typeof value.observation_type === "string"
      ? { observation_type: value.observation_type as ReviewObservationInput["observation_type"] }
      : {}),
    ...(value.linked_test_id === null || typeof value.linked_test_id === "string"
      ? { linked_test_id: value.linked_test_id }
      : {}),
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ observationId: string }> },
) {
  const context = demoContext();
  if (!context) {
    return NextResponse.json(
      { error: "Observation review requires an authenticated teacher context" },
      { status: 503 },
    );
  }

  try {
    const body: unknown = await request.json().catch(() => undefined);
    if (body === undefined) {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    const { observationId } = await params;
    const result = await reviewObservation(observationId, parseInput(body), context);
    return NextResponse.json({
      duplicate: result.duplicate,
      observation: {
        observation_id: result.observation.observation_id,
        original_observation: result.observation.original_observation,
        reviewed_observation: result.observation.reviewed_observation,
        teacher_review_status: result.observation.teacher_review_status,
      },
    });
  } catch (error) {
    if (error instanceof ObservationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to review observation:", error);
    return NextResponse.json({ error: "Failed to review observation" }, { status: 500 });
  }
}
