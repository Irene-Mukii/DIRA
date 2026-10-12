// POST /api/mcp/suggest-test - Suggests a low-prep classroom activity based on learner observations
// Request body: { learner_id, teacher_id, school_id }
// Returns: hypothesis, cited_observations, suggested_activity, what_to_log_afterward, etc.

import { NextRequest, NextResponse } from "next/server";
import { suggestTest, type SuggestTestContext } from "@/lib/mcp-tools/suggestTest";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const learnerId = body.learner_id?.trim();
    const teacherId = body.teacher_id?.trim();
    const schoolId = body.school_id?.trim();

    if (!learnerId || !teacherId || !schoolId) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "learner_id, teacher_id, and school_id are required" },
        { status: 400 }
      );
    }

    const context: SuggestTestContext = { teacher_id: teacherId, school_id: schoolId };
    const result = await suggestTest(learnerId, context);

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}