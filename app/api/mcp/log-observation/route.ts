import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db/client";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import { logObservation, ObservationError } from "../../../../lib/mcp-tools/logObservation";
import {
  CAPTURE_METHODS,
  OBSERVATION_TYPES,
  type LogObservationInput,
  type ObservationRecord,
} from "../../../../lib/db/schema";

export const runtime = "nodejs";

type ObservationChatRow = Pick<
  ObservationRecord,
  | "observation_id"
  | "original_observation"
  | "reviewed_observation"
  | "teacher_review_status"
  | "created_at"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  input: Record<string, unknown>,
  key: string,
): string {
  const value = input[key];
  if (typeof value !== "string") {
    throw new ObservationError(`${key} must be a string`, 400);
  }
  return value;
}

function optionalString(
  input: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = input[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ObservationError(`${key} must be a string`, 400);
  }
  return value;
}

function parseInput(value: unknown): LogObservationInput {
  if (!isRecord(value)) {
    throw new ObservationError("Request body must be a JSON object", 400);
  }
  const observationType = requiredString(value, "observation_type");
  if (!(OBSERVATION_TYPES as readonly string[]).includes(observationType)) {
    throw new ObservationError("Invalid observation_type", 400);
  }

  const captureMethod = value.capture_method ?? "text";
  if (
    typeof captureMethod !== "string" ||
    !(CAPTURE_METHODS as readonly string[]).includes(captureMethod)
  ) {
    throw new ObservationError("Invalid capture_method", 400);
  }
  if (captureMethod !== "text") {
    throw new ObservationError(
      "Voice observations require a verified server-side transcription flow",
      400,
    );
  }

  return {
    learner_id: requiredString(value, "learner_id"),
    observation_type: observationType as LogObservationInput["observation_type"],
    content: requiredString(value, "content"),
    observed_at: requiredString(value, "observed_at"),
    calendar_entry_id: optionalString(value, "calendar_entry_id"),
    subject: optionalString(value, "subject"),
    term: optionalString(value, "term"),
    activity_context: optionalString(value, "activity_context"),
    linked_test_id: optionalString(value, "linked_test_id"),
    capture_method: captureMethod as LogObservationInput["capture_method"],
    submission_id: requiredString(value, "submission_id"),
  };
}

export async function POST(request: NextRequest) {
  try {
    const context = await resolveTeacherContext();
    if (!context) {
      return NextResponse.json(
        { error: "Observation submission requires an authenticated teacher context" },
        { status: 503 },
      );
    }

    const body: unknown = await request.json().catch(() => undefined);
    if (body === undefined) {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }

    const result = await logObservation(parseInput(body), context);
    return NextResponse.json({
      duplicate: result.duplicate,
      observation: { observation_id: result.observation.observation_id },
    }, {
      status: result.duplicate ? 200 : 201,
    });
  } catch (error) {
    if (error instanceof ObservationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error("Failed to log observation:", error);
    return NextResponse.json(
      { error: "Failed to save observation" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const learnerId = request.nextUrl.searchParams.get("learner_id")?.trim();
  if (!learnerId) {
    return NextResponse.json(
      { error: "learner_id query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const context = await resolveTeacherContext();
    if (!context) {
      return NextResponse.json(
        { error: "Observation retrieval requires a teacher context" },
        { status: 503 },
      );
    }

    const learnerScope = await pool.query<{
      class_id: string;
      academic_year: number;
    }>(
      `SELECT e.class_id, e.academic_year
       FROM learners l
       JOIN learner_enrollments e ON e.learner_id = l.learner_id
       JOIN classes c
         ON c.class_id = e.class_id
        AND c.school_id = e.school_id
        AND c.academic_year = e.academic_year
       WHERE l.learner_id = $1
         AND e.school_id = $2
         AND e.enrolment_status <> 'Withdrawn'
         AND e.enrolled_from <= CURRENT_DATE
         AND (e.enrolled_to IS NULL OR e.enrolled_to >= CURRENT_DATE)
         AND EXISTS (
           SELECT 1
           FROM timetable_assignments ta
           WHERE ta.class_id = e.class_id
             AND ta.school_id = e.school_id
             AND ta.academic_year = e.academic_year
             AND ta.teacher_id = $3
             AND ta.valid_from <= CURRENT_DATE
             AND (ta.valid_to IS NULL OR ta.valid_to >= CURRENT_DATE)
         )
       ORDER BY e.academic_year DESC
       LIMIT 1`,
      [learnerId, context.school_id, context.teacher_id],
    );
    if (!learnerScope.rows[0]) {
      return NextResponse.json(
        { error: "Learner is not currently assigned to this teacher" },
        { status: 404 },
      );
    }

    const result = await pool.query<ObservationChatRow>(
      `SELECT observation_id, original_observation, reviewed_observation,
              teacher_review_status, created_at
       FROM observations
       WHERE learner_id = $1
         AND school_id = $2
         AND class_id = $3
         AND academic_year = $4
      ORDER BY observed_at ASC, created_at ASC`,
      [
        learnerId,
        context.school_id,
        learnerScope.rows[0].class_id,
        learnerScope.rows[0].academic_year,
      ],
    );

    return NextResponse.json({
      observations: result.rows,
      count: result.rowCount ?? 0,
    });
  } catch (error) {
    console.error("Failed to retrieve observations:", error);
    return NextResponse.json(
      { error: "Failed to retrieve observations" },
      { status: 500 },
    );
  }
}
