import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { dispatchOneDueFollowUp } from "@/lib/services/follow-up-dispatch";

export const runtime = "nodejs";

/**
 * Let a trusted scheduler dispatch at most one currently due call per request.
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
    const result = await dispatchOneDueFollowUp();
    return NextResponse.json({ call: result });
  } catch (error) {
    console.error("Failed to dispatch teacher follow-up:", error);
    return NextResponse.json(
      { error: "Failed to dispatch teacher follow-up" },
      { status: 500 },
    );
  }
}

/** Compare equal-length scheduler credentials in constant time. */
function secretsMatch(supplied: string, expected: string): boolean {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}
