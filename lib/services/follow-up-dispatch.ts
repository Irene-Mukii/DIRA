import "server-only";

import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db/client";
import {
  AfricaTalkingCallError,
  initiateAfricaTalkingCall,
} from "@/lib/external-mcp/voice";

interface ClaimedCall {
  follow_up_job_id: string;
  teacher_id: string;
  provider_request_id: string;
}

interface VoiceConfiguration {
  username: string;
  apiKey: string;
  callerId: string;
  destination: string;
  sandbox: boolean;
}

export interface FollowUpDispatchResult {
  follow_up_job_id: string;
  status: "provider_accepted" | "provider_rejected" | "outcome_unknown";
  error_code?: string;
}

/**
 * Submit at most one eligible call per invocation, after rechecking the schedule.
 * The demo override is the only enabled recipient until teacher consent and
 * contact verification are implemented.
 */
export async function dispatchOneDueFollowUp(
  now: Date = new Date(),
): Promise<FollowUpDispatchResult | null> {
  const config = getVoiceConfiguration();
  const claimed = await claimDueFollowUp(now);
  if (!claimed) {
    return null;
  }

  try {
    const result = await initiateAfricaTalkingCall({
      username: config.username,
      apiKey: config.apiKey,
      callerId: config.callerId,
      destination: config.destination,
      clientRequestId: claimed.provider_request_id,
      sandbox: config.sandbox,
    });

    await pool.query(
      `UPDATE teacher_follow_up_jobs
       SET status = 'provider_accepted',
           provider_http_status = $2,
           provider_accepted_at = NOW(),
           last_error_code = NULL,
           updated_at = NOW()
       WHERE follow_up_job_id = $1 AND status = 'initiating'`,
      [claimed.follow_up_job_id, result.httpStatus],
    );

    return {
      follow_up_job_id: claimed.follow_up_job_id,
      status: "provider_accepted",
    };
  } catch (error) {
    const callError =
      error instanceof AfricaTalkingCallError
        ? error
        : new AfricaTalkingCallError(
            "Call outcome is unknown after dispatch",
            "outcome_unknown",
          );
    const status = callError.code;

    await pool.query(
      `UPDATE teacher_follow_up_jobs
       SET status = $2,
           last_error_code = $3,
           updated_at = NOW()
       WHERE follow_up_job_id = $1 AND status = 'initiating'`,
      [claimed.follow_up_job_id, status, callError.code],
    );

    return {
      follow_up_job_id: claimed.follow_up_job_id,
      status,
      error_code: callError.code,
    };
  }
}

/**
 * Refuse incomplete or unsafe provider configuration before claiming a job.
 */
function getVoiceConfiguration(): VoiceConfiguration {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.DIRA_DEMO_CALL_TEST_MODE !== "true"
  ) {
    throw new Error("Outbound calls are disabled outside local demo test mode");
  }

  const username = process.env.AFRICASTALKING_USERNAME?.trim();
  const apiKey = process.env.AFRICASTALKING_API_KEY?.trim();
  const callerId = process.env.AFRICASTALKING_VOICE_FROM?.trim();
  const destination = process.env.DIRA_DEMO_CALL_TO?.trim();
  const sandboxValue = process.env.AFRICASTALKING_SANDBOX?.trim();

  if (!username || !apiKey || !callerId || !destination) {
    throw new Error("Africa's Talking demo calling is not fully configured");
  }
  if (!isE164(destination) || !isE164(callerId)) {
    throw new Error("Africa's Talking caller and demo destination must be E.164 numbers");
  }
  if (sandboxValue !== "true" && sandboxValue !== "false") {
    throw new Error("AFRICASTALKING_SANDBOX must be explicitly true or false");
  }

  return {
    username,
    apiKey,
    callerId,
    destination,
    sandbox: sandboxValue === "true",
  };
}

/**
 * Claim one due row atomically so concurrent scheduler runs cannot dial twice.
 */
async function claimDueFollowUp(
  now: Date,
): Promise<ClaimedCall | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const requestId = randomUUID();
    const result = await client.query<ClaimedCall>(
      `WITH eligible AS (
         SELECT job.follow_up_job_id
         FROM teacher_follow_up_jobs AS job
         JOIN schools AS school ON school.school_id = job.school_id
         JOIN school_calendar AS entry
           ON entry.calendar_entry_id = job.calendar_entry_id
          AND entry.school_id = job.school_id
          AND entry.class_id = job.class_id
          AND entry.teacher_id = job.teacher_id
          AND entry.calendar_date = job.scheduled_date
          AND entry.event_status = 'scheduled'
         JOIN timetable_assignments AS assignment
           ON assignment.timetable_assignment_id = entry.timetable_assignment_id
          AND assignment.school_id = entry.school_id
          AND assignment.class_id = entry.class_id
          AND assignment.teacher_id = entry.teacher_id
          AND assignment.academic_year = entry.academic_year
          AND assignment.weekday = entry.weekday
          AND assignment.period_number = entry.period_number
          AND assignment.start_time = entry.start_time
          AND assignment.end_time = entry.end_time
          AND assignment.valid_from <= entry.calendar_date
          AND (assignment.valid_to IS NULL OR assignment.valid_to >= entry.calendar_date)
         WHERE job.status = 'queued'
           AND job.scheduled_end_at <= $1
           AND school.timezone IS NOT NULL
           AND job.scheduled_date =
             ($1 AT TIME ZONE school.timezone)::date
           AND entry.weekday =
             EXTRACT(ISODOW FROM entry.calendar_date)::smallint
           AND EXISTS (
             SELECT 1
             FROM school_closure_coverage AS coverage
             WHERE coverage.school_id = job.school_id
               AND coverage.coverage_start <= job.scheduled_date
               AND coverage.coverage_end >= job.scheduled_date
           )
           AND NOT EXISTS (
             SELECT 1 FROM school_closures AS closure
             WHERE closure.school_id = job.school_id
               AND closure.closure_date = job.scheduled_date
           )
           AND NOT EXISTS (
             SELECT 1
             FROM school_calendar AS overlap
             WHERE overlap.school_id = entry.school_id
               AND overlap.teacher_id = entry.teacher_id
               AND overlap.calendar_date = entry.calendar_date
               AND overlap.calendar_entry_id <> entry.calendar_entry_id
               AND overlap.event_status = 'scheduled'
               AND overlap.start_time < entry.end_time
               AND overlap.end_time > entry.start_time
           )
           AND NOT EXISTS (
             SELECT 1
             FROM school_calendar AS active_period
             WHERE active_period.school_id = entry.school_id
               AND active_period.teacher_id = entry.teacher_id
               AND active_period.calendar_date = entry.calendar_date
               AND active_period.calendar_entry_id <> entry.calendar_entry_id
               AND active_period.event_status = 'scheduled'
               AND (active_period.calendar_date + active_period.start_time)
                     AT TIME ZONE school.timezone <= $1
               AND (active_period.calendar_date + active_period.end_time)
                     AT TIME ZONE school.timezone > $1
           )
         ORDER BY job.scheduled_end_at, job.follow_up_job_id
         LIMIT 1
         FOR UPDATE OF job SKIP LOCKED
       )
       UPDATE teacher_follow_up_jobs AS job
       SET status = 'initiating',
           provider_request_id = $2,
           attempt_count = attempt_count + 1,
           attempt_started_at = $1,
           last_error_code = NULL,
           updated_at = NOW()
       FROM eligible
       WHERE job.follow_up_job_id = eligible.follow_up_job_id
       RETURNING job.follow_up_job_id, job.teacher_id,
                 job.provider_request_id::text AS provider_request_id`,
      [now, requestId],
    );

    await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Call claim failed and its transaction could not be rolled back",
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Accept international E.164 format without formatting or guessing a number. */
function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
