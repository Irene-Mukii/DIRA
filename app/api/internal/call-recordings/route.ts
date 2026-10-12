import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processPendingRecordings } from "@/lib/services/call-recordings";

export const runtime = "nodejs";

/**
 * Trusted-scheduler endpoint that retries pending/failed recordings (transcription and
 * draft generation). Same bearer-secret pattern as the other internal routes.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.FOLLOW_UP_SCHEDULER_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Scheduler is not configured" }, { status: 503 });
  }
  const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await processPendingRecordings({ limit: 5 }));
  } catch (error) {
    console.error("Recording worker failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Recording processing failed" }, { status: 500 });
  }
}
