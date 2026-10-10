import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TEACHER_GREETING =
  "Hello teacher, please share remarks you have for one or more of your focus group of the week. Make sure to state the name of the child you are talking about before each of their observations. You may begin.";

/**
 * Return the fixed Africa's Talking Voice response for a connected call.
 * This only plays the prompt; recording, transcription, and saving are Phase 4.
 */
function voicePromptResponse() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${TEACHER_GREETING}</Say></Response>`;
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  return voicePromptResponse();
}

export async function POST() {
  return voicePromptResponse();
}
