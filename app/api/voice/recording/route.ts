import { NextRequest } from "next/server";
import { handleProviderCallback } from "@/lib/services/voice-callback-handler";

export const runtime = "nodejs";

/** Recording callback: the <Record callbackUrl> target that delivers recordingUrl. */
export async function POST(request: NextRequest) {
  return handleProviderCallback(request, "recording");
}
