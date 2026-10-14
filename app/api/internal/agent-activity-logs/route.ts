import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db/client";

export const runtime = "nodejs";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const ALLOWED_STATUSES = ["started", "success", "error"] as const;

function secretsMatch(supplied: string, expected: string): boolean {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);

  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.FOLLOW_UP_SCHEDULER_SECRET;

  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Activity log access is not configured" },
      { status: 503 },
    );
  }

  const suppliedSecret = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!suppliedSecret || !secretsMatch(suppliedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
  const status = params.get("status");
  const toolName = params.get("tool_name");
  const runId = params.get("run_id");

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT
  ) {
    return NextResponse.json(
      { error: `limit must be an integer between 1 and ${MAX_LIMIT}` },
      { status: 400 },
    );
  }

  if (
    status !== null &&
    !ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])
  ) {
    return NextResponse.json(
      { error: "status must be started, success, or error" },
      { status: 400 },
    );
  }

  if (toolName !== null && (toolName.length < 1 || toolName.length > 100)) {
    return NextResponse.json(
      { error: "tool_name must be between 1 and 100 characters" },
      { status: 400 },
    );
  }

  if (runId !== null && !/^[0-9a-f-]{36}$/i.test(runId)) {
    return NextResponse.json(
      { error: "run_id must be a valid UUID" },
      { status: 400 },
    );
  }

  try {
    const result = await pool.query(
      `SELECT
         id,
         run_id,
         timestamp,
         event_type,
         workflow,
         agent_action,
         tool_name,
         status,
         duration_ms,
         error,
         provider,
         model,
         input_tokens,
         output_tokens,
         cached_tokens,
         cost_usd,
         cost_status,
         metadata
       FROM agent_activity_logs
       WHERE ($1::text IS NULL OR status = $1)
         AND ($2::text IS NULL OR tool_name = $2)
         AND ($3::uuid IS NULL OR run_id = $3::uuid)
       ORDER BY timestamp DESC, id DESC
       LIMIT $4`,
      [status, toolName, runId, limit],
    );

    return NextResponse.json({
      logs: result.rows,
      limit,
      count: result.rowCount ?? result.rows.length,
    });
  } catch (error) {
    console.error("Failed to retrieve agent activity logs:", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    return NextResponse.json(
      { error: "Failed to retrieve agent activity logs" },
      { status: 500 },
    );
  }
}
