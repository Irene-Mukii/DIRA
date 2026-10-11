import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import {
  buildEvidenceSummary,
  EvidenceSummaryNotFoundError,
} from "@/lib/services/evidence-summary";

export const runtime = "nodejs";

const requestSchema = z.object({
  learner_id: z.string().trim().min(1).max(200),
});

export async function POST(request: NextRequest) {
  try {
    const context = await resolveTeacherContext();
    if (!context) {
      return NextResponse.json(
        { error: "An authenticated teacher context is required" },
        { status: 503 },
      );
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
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "learner_id is required" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      await buildEvidenceSummary(parsed.data.learner_id, context),
    );
  } catch (error) {
    if (error instanceof EvidenceSummaryNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Failed to build learner evidence summary:", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Learner evidence summary failed" },
      { status: 500 },
    );
  }
}
