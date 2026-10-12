import { randomUUID } from "node:crypto";

type ToolStatus = "started" | "success" | "error";

interface ToolLog {
  run_id: string;
  agent_action: string;
  tool_name: string;
  status: ToolStatus;
  duration_ms?: number;
  error?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: Record<string, unknown>;
}

export function createRunId(): string {
  return randomUUID();
}

export async function logToolEvent(event: ToolLog): Promise<void> {
  const timestamp = new Date().toISOString();

  // Keep terminal logging available even if database persistence fails.
  console.error(JSON.stringify({ timestamp, ...event }));

  try {
    // Import lazily so environment configuration is loaded first.
    const { pool } = await import("../db/client");

    await pool.query(
      `INSERT INTO agent_activity_logs (
        run_id,
        timestamp,
        agent_action,
        tool_name,
        tool_input,
        tool_output,
        status,
        duration_ms,
        error
      ) VALUES (
        $1, $2::timestamptz, $3, $4, $5::jsonb,
        $6::jsonb, $7, $8, $9
      )`,
      [
        event.run_id,
        timestamp,
        event.agent_action,
        event.tool_name,
        event.tool_input ? JSON.stringify(event.tool_input) : null,
        event.tool_output ? JSON.stringify(event.tool_output) : null,
        event.status,
        event.duration_ms ?? null,
        event.error ?? null,
      ],
    );
  } catch (loggingError) {
    // Observations must not fail just because activity logging failed.
    console.error(
      "Failed to persist agent activity log:",
      loggingError instanceof Error
        ? loggingError.message
        : "Unknown logging error",
    );
  }
}

// Compatibility logger used by the transcription handler.
// Do not log transcription text or other sensitive content.
export const logger = {
  log(eventName: string, metadata: Record<string, unknown> = {}): void {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        agent_action: eventName,
        ...metadata,
      }),
    );
  },
};
