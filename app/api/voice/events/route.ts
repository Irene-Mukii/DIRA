import { NextRequest } from "next/server";
import { handleProviderCallback } from "@/lib/services/voice-callback-handler";

export const runtime = "nodejs";

/**
 * Call lifecycle events callback. The account currently shows no events URL (N/A),
 * so this route is OPTIONAL and UNVERIFIED: the flow also works from the voice and
 * recording callbacks alone. Configure it in the dashboard only if the account offers it.
 */
export async function POST(request: NextRequest) {
  return handleProviderCallback(request, "events");
}
