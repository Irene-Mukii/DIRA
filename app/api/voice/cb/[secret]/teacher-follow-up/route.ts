import { NextRequest } from "next/server";
import { handleVoiceInstructions } from "@/lib/services/voice-callback-handler";

export const runtime = "nodejs";

/** Dashboard voice callback with the secret as a path segment (dashboard rejects ?token=). */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ secret: string }> },
) {
  const { secret } = await context.params;
  return handleVoiceInstructions(request, secret);
}
