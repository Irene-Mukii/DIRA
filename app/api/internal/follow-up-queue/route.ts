import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prepareDailyFollowUpQueue } from "@/lib/services/follow-up-queue";

export const runtime = "nodejs";

/**
 * Run queue preparation on demand; a hosting scheduler should call this at 7 a.m.
 * local time with the configured bearer secret.
 */
export async function POST(request: NextRequest) {
  const expectedSecret = process.env.FOLLOW_UP_SCHEDULER_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Follow-up scheduler is not configured" },
      { status: 503 },
    );
  }

  const suppliedSecret = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!suppliedSecret || !secretsMatch(suppliedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await prepareDailyFollowUpQueue();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to prepare teacher follow-up queue:", error);
    return NextResponse.json(
      { error: "Failed to prepare teacher follow-up queue" },
      { status: 500 },
    );
  }
}

/** Compare the configured scheduler credential without a timing-based shortcut. */
function secretsMatch(supplied: string, expected: string): boolean {
  // Compare equal-length buffers in constant time to avoid timing leaks.
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}
