import { randomUUID } from "node:crypto";
import { pool } from "../db/client";

// Preserve the existing application logger.
export const logger = {
  log: (action: string, data?: unknown) => {
    console.log(`[${new Date().toISOString()}] ${action}`, data);
  },
  error: (action: string, data?: unknown) => {
    console.error(`[${new Date().toISOString()}] ERROR: ${action}`, data);
  },
};

export type ToolStatus = "started" | "success" | "error";

export interface ToolLog {
  run_id: string;
  agent_action: string;
  tool_name: string;
  status: ToolStatus;
  tool_input?: Record<string, unknown>;
  tool_output?: Record<string, unknown>;
  duration_ms?: number;
  error?: string;
}

export function createRunId(): string {
  return randomUUID();
}

export async function logToolEvent(event: ToolLog): Promise<void> {
  // Avoid logging the original learner observation text.
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      ...event,
    }),
  );

  await pool.query(
    `INSERT INTO agent_activity_logs (
       run_id, agent_action, tool_name,
       tool_input, tool_output, status,
       duration_ms, error
     )
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)`,
    [
      event.run_id,
      event.agent_action,
      event.tool_name,
      event.tool_input ? JSON.stringify(event.tool_input) : null,
      event.tool_output ? JSON.stringify(event.tool_output) : null,
      event.status,
      event.duration_ms ?? null,
      event.error ?? null,
    ],
  );
}
