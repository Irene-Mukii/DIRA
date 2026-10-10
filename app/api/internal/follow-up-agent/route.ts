import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  runScheduledAgent,
  ScheduledAgentError,
  type ScheduledAgentTrigger,
} from "@/lib/agent/orchestrator";
import {
  GlmConfigurationError,
  GlmRequestError,
} from "@/lib/models";

export const runtime = "nodejs";

const ALLOWED_TRIGGERS: readonly ScheduledAgentTrigger[] = [
  "prepare_queue",
  "dispatch_due",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTrigger(value: unknown): value is ScheduledAgentTrigger {
  return value === "prepare_queue" || value === "dispatch_due";
}

function secretsMatch(supplied: string, expected: string): boolean {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (
    !isRecord(body) ||
    !isTrigger(body.trigger) ||
    !ALLOWED_TRIGGERS.includes(body.trigger)
  ) {
    return NextResponse.json(
      { error: "trigger must be prepare_queue or dispatch_due" },
      { status: 400 },
    );
  }

  try {
    const result = await runScheduledAgent(body.trigger);
    return NextResponse.json(result, {
      status: result.status === "completed" ? 200 : 502,
    });
  } catch (error) {
    console.error("Scheduled Dira agent run failed:", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    const safeMessage =
      error instanceof ScheduledAgentError ||
      error instanceof GlmConfigurationError ||
      error instanceof GlmRequestError
        ? error.message
        : "Scheduled Dira agent run failed";
    const status = error instanceof GlmConfigurationError ? 503 : 502;
    return NextResponse.json(
      { error: safeMessage },
      { status },
    );
  }
}
