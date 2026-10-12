import { NextRequest } from "next/server";
import { handleProviderCallback } from "@/lib/services/voice-callback-handler";

export const runtime = "nodejs";

/** Recording callback (the <Record callbackUrl> target) with the secret as a path segment. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ secret: string }> },
) {
  const { secret } = await context.params;
  return handleProviderCallback(request, "recording", secret);
}
