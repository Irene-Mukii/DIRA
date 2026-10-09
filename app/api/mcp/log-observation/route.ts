import { NextRequest, NextResponse } from "next/server";
import { pool } from "../../../../lib/db/client";
import { logObservation, ObservationError } from "../../../../lib/mcp-tools/logObservation";
import type { ObservationRecord } from "../../../../lib/db/schema";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 },
      );
    }

    const input = body as Record<string, unknown>;

    const result = await logObservation({
      learner_id: input.learner_id as string,
      observation_type: input.observation_type as never,
      content: input.content as string,
      subject: input.subject as string | undefined,
      term: input.term as string | undefined,
      observed_at: input.observed_at as string | undefined,
      linked_test_id: input.linked_test_id as string | undefined,
      capture_method: (input.capture_method ?? "text") as never,
      submission_id: input.submission_id as string,
    });

    return NextResponse.json(result, {
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
  const learnerId = request.nextUrl.searchParams.get("learner_id");

  if (!learnerId?.trim()) {
    return NextResponse.json(
      { error: "learner_id query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const result = await pool.query<ObservationRecord>(
      `SELECT *
       FROM observations
       WHERE learner_id = $1
       ORDER BY COALESCE(observed_at, created_at) DESC, created_at DESC`,
      [learnerId.trim()],
    );

    return NextResponse.json({
      observations: result.rows,
      count: result.rowCount,
    });
  } catch (error) {
    console.error("Failed to retrieve observations:", error);

    return NextResponse.json(
      { error: "Failed to retrieve observations" },
      { status: 500 },
    );
  }
}
