import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db/client";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const ALLOWED_STATUSES = ["started", "success", "error"] as const;

export async function GET(request: NextRequest) {
  // Teacher context is available only in development or explicit demo mode.
  // Do not expose internal diagnostic logs in a production deployment without
  // adding real authenticated admin/role authorization.
  const context = await resolveTeacherContext();
  if (!context) {
    return NextResponse.json(
      { error: "Agent activity logs are not available in this environment" },
      { status: 403 },
    );
  }

  const params = request.nextUrl.searchParams;
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
  const status = params.get("status");
  const toolName = params.get("tool_name")?.trim() || null;
  const runId = params.get("run_id")?.trim() || null;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
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

  if (runId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
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
         agent_action,
         tool_name,
         status,
         duration_ms,
         error
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
