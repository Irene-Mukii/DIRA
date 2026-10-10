import "server-only";

import { pool } from "@/lib/db/client";
import type { LogObservationContext } from "@/lib/db/schema";

export async function resolveTeacherContext(): Promise<LogObservationContext | null> {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.DIRA_DEMO_MODE !== "true"
  ) {
    return null;
  }

  const result = await pool.query<LogObservationContext>(
    `SELECT teacher_id, school_id
     FROM teachers
     ORDER BY created_at ASC, teacher_id ASC, school_id ASC
     LIMIT 1`,
  );

  return result.rows[0] ?? null;
}
