import { NextRequest, NextResponse } from "next/server";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import { dispatchOneDueFollowUp } from "@/lib/services/follow-up-dispatch";
import { queueManualDemoFollowUp } from "@/lib/services/follow-up-queue";
import {
  completePublicDemoCallReservation,
  PublicDemoCallLimitError,
  reservePublicDemoCall,
} from "@/lib/services/public-demo-voice";
import {
  isE164,
  isProductionPublicDemoVoiceEnabled,
} from "@/lib/services/voice-config";

export const runtime = "nodejs";
export const maxDuration = 30;

function isSameOriginHttpsRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    return (
      originUrl.origin === request.nextUrl.origin &&
      (process.env.NODE_ENV !== "production" || originUrl.protocol === "https:")
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isProductionPublicDemoVoiceEnabled()) {
    return NextResponse.json(
      { error: "On-demand demo calls are not enabled" },
      { status: 503 },
    );
  }
  if (!isSameOriginHttpsRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request must contain valid JSON" },
      { status: 400 },
    );
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("phoneNumber" in body) ||
    typeof body.phoneNumber !== "string" ||
    !isE164(body.phoneNumber.trim()) ||
    !("consent" in body) ||
    body.consent !== true
  ) {
    return NextResponse.json(
      { error: "Enter a valid international number and confirm call consent" },
      { status: 400 },
    );
  }

  const phoneNumber = body.phoneNumber.trim();
  let reservationId: string | null = null;
  let reservationFinished = false;

  async function finishReservation(succeeded: boolean): Promise<void> {
    if (!reservationId || reservationFinished) return;
    await completePublicDemoCallReservation(reservationId, succeeded);
    reservationFinished = true;
  }

  try {
    const context = await resolveTeacherContext();
    if (!context) {
      return NextResponse.json(
        { error: "Demo teacher context is not configured" },
        { status: 503 },
      );
    }

    reservationId = await reservePublicDemoCall(phoneNumber);
    const job = await queueManualDemoFollowUp(context);
    const call = await dispatchOneDueFollowUp(
      new Date(),
      context,
      job.follow_up_job_id,
      {
        publicDemoCallAuthorized: true,
        destinationOverride: phoneNumber,
      },
    );
    if (!call) {
      await finishReservation(false);
      return NextResponse.json(
        { error: "No demo call was dispatched; check the call status before retrying" },
        { status: 409 },
      );
    }

    const succeeded = call.status === "provider_accepted";
    await finishReservation(succeeded);
    return NextResponse.json(
      { status: call.status, is_demo: call.is_demo === true },
      { status: succeeded ? 200 : 502 },
    );
  } catch (error) {
    if (reservationId && !reservationFinished) {
      try {
        await finishReservation(false);
      } catch (finishError) {
        console.error("Could not finalize demo call rate-limit record:", {
          errorName:
            finishError instanceof Error ? finishError.name : "UnknownError",
        });
      }
    }
    if (error instanceof PublicDemoCallLimitError) {
      return NextResponse.json(
        {
          error:
            error.limit === "number"
              ? "This number has already requested a demo call in the last 24 hours"
              : "The demo call limit has been reached; try again later",
        },
        { status: 429 },
      );
    }
    console.error("On-demand demo call failed:", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "The demo call could not be requested" },
      { status: 502 },
    );
  }
}
