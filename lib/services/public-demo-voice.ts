import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import { pool } from "@/lib/db/client";
import { isE164 } from "@/lib/services/voice-config";

export const PUBLIC_DEMO_CALL_LIMIT_PER_NUMBER = 1;
export const PUBLIC_DEMO_CALL_LIMIT_GLOBAL = 10;
export const PUBLIC_DEMO_CALL_WINDOW_HOURS = 24;

export class PublicDemoCallLimitError extends Error {
  constructor(public readonly limit: "number" | "global") {
    super("The demo call limit has been reached");
    this.name = "PublicDemoCallLimitError";
  }
}

function hashPhoneNumber(phoneNumber: string): string {
  const secret = process.env.DEMO_CALL_RATE_LIMIT_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("Demo call rate-limit secret must be at least 32 bytes");
  }
  return createHmac("sha256", secret).update(phoneNumber).digest("hex");
}

/** Atomically reserve an attempt while storing only a keyed phone-number hash. */
export async function reservePublicDemoCall(
  phoneNumber: string,
): Promise<string> {
  if (!isE164(phoneNumber)) {
    throw new Error("Demo call phone number must be in E.164 format");
  }

  const phoneHash = hashPhoneNumber(phoneNumber);
  const eventId = randomUUID();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(824139210481::bigint)");

    const counts = await client.query<{
      phone_count: number;
      global_count: number;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE metadata->>'phone_hash' = $1)::int AS phone_count,
         COUNT(*)::int AS global_count
       FROM agent_activity_logs
       WHERE event_type = 'public_demo_call_requested'
         AND timestamp >= NOW() - INTERVAL '24 hours'`,
      [phoneHash],
    );

    if (counts.rows[0].phone_count >= PUBLIC_DEMO_CALL_LIMIT_PER_NUMBER) {
      throw new PublicDemoCallLimitError("number");
    }
    if (counts.rows[0].global_count >= PUBLIC_DEMO_CALL_LIMIT_GLOBAL) {
      throw new PublicDemoCallLimitError("global");
    }

    await client.query(
      `INSERT INTO agent_activity_logs (
         id, run_id, event_type, agent_action, tool_name, status, metadata
       )
       VALUES ($1, $1, 'public_demo_call_requested',
               'public_demo_call_requested', 'public_demo_voice', 'started', $2::jsonb)`,
      [eventId, JSON.stringify({ phone_hash: phoneHash })],
    );
    await client.query("COMMIT");
    return eventId;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Public demo call reservation and rollback both failed",
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function completePublicDemoCallReservation(
  eventId: string,
  succeeded: boolean,
): Promise<void> {
  const result = await pool.query(
    `UPDATE agent_activity_logs
     SET status = $2
     WHERE id = $1
       AND event_type = 'public_demo_call_requested'
       AND status = 'started'`,
    [eventId, succeeded ? "success" : "error"],
  );
  if (result.rowCount !== 1) {
    throw new Error("Public demo call reservation status could not be updated");
  }
}
