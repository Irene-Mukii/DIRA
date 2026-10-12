import { NextRequest } from "next/server";
import { handleVoiceInstructions } from "@/lib/services/voice-callback-handler";

export const runtime = "nodejs";

/** Legacy ?token= form of the voice callback; prefer /api/voice/cb/<secret>/teacher-follow-up. */
export async function POST(request: NextRequest) {
  return handleVoiceInstructions(request);
}
