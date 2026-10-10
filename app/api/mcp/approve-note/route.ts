// Gate endpoint - only UI can call this
// POST /api/mcp/approve-note - Approves a drafted pathway note
// Agent has no access to this endpoint

// NOT DOING THIS PART WITH THE NEW OUTPUT GENERATION OF STUDENT CARD; hypothesis, suggested test, what happened - card
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "NOT_IMPLEMENTED",
      message: "Note approval is not implemented yet.",
    },
    { status: 501 }
  );
}