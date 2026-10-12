import { NextRequest } from "next/server";
import { handleProviderCallback } from "@/lib/services/voice-callback-handler";

export const runtime = "nodejs";

/** Optional events callback (lifecycle updates); only useful if the account offers one. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ secret: string }> },
) {
  const { secret } = await context.params;
  return handleProviderCallback(request, "events", secret);
}
