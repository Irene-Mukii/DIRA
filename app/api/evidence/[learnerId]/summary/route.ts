import { NextResponse } from "next/server";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import {
  EvidenceReasoningError,
  generateEvidenceSummary,
} from "@/lib/services/evidence-reasoning";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ learnerId: string }> },
) {
  const context = await resolveTeacherContext();
  if (!context) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "TEACHER_CONTEXT_UNAVAILABLE",
          message: "An authenticated teacher context is required.",
          retryable: false,
        },
      },
      { status: 503 },
    );
  }

  const { learnerId } = await params;
  try {
    const summary = await generateEvidenceSummary(
      learnerId,
      context,
      _request.headers.get("x-request-id") ?? undefined,
    );
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const failure =
      error instanceof EvidenceReasoningError
        ? error
        : new EvidenceReasoningError(
            "EVIDENCE_REASONING_FAILED",
            "Evidence summary generation failed.",
            500,
            true,
          );
    if (!(error instanceof EvidenceReasoningError)) {
      console.error("Evidence summary API failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: failure.code,
          message: failure.message,
          retryable: failure.retryable,
        },
      },
      { status: failure.httpStatus },
    );
  }
}
