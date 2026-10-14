import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import { dispatchOneDueFollowUp } from "@/lib/services/follow-up-dispatch";
import { queueManualDemoFollowUp } from "@/lib/services/follow-up-queue";
import { isProductionDemoVoiceEnabled } from "@/lib/services/voice-config";

export const runtime = "nodejs";
export const maxDuration = 30;

function secretsMatch(supplied: string, expected: string): boolean {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

/** Queue and dispatch one call to the configured demo number for an operator. */
export async function POST(request: NextRequest) {
  if (!isProductionDemoVoiceEnabled()) {
    return NextResponse.json(
      { error: "Production demo voice is not enabled" },
      { status: 503 },
    );
  }

  const expectedSecret = process.env.FOLLOW_UP_SCHEDULER_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Demo voice operator access is not configured" },
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
    const context = await resolveTeacherContext();
    if (!context) {
      return NextResponse.json(
        { error: "The demo teacher context is not configured" },
        { status: 503 },
      );
    }

    const job = await queueManualDemoFollowUp(context);
    const call = await dispatchOneDueFollowUp(
      new Date(),
      context,
      job.follow_up_job_id,
      { operatorAuthorized: true },
    );
    if (!call) {
      return NextResponse.json(
        { error: "No queued demo call was dispatched; check its status before retrying" },
        { status: 409 },
      );
    }

    return NextResponse.json({
      status: call.status,
      is_demo: call.is_demo === true,
      already_queued: job.already_queued,
    });
  } catch (error) {
    console.error("Production demo voice dispatch failed:", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Production demo voice dispatch failed" },
      { status: 502 },
    );
  }
}
