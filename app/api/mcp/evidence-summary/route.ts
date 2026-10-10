// Irene's tool endpoint
// POST /api/mcp/evidence-summary - Drafts a learning pathway note

// output is for the student card, which is now generated in the UI, not the backend
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "NOT_IMPLEMENTED",
      message: "Evidence summary is not implemented yet.",
    },
    { status: 501 }
  );
}