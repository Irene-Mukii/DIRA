import "server-only";

import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db/client";
import type { LogObservationContext } from "@/lib/db/schema";
import {
  AfricaTalkingCallError,
  initiateAfricaTalkingCall,
} from "@/lib/external-mcp/voice";
import {
  getVoiceDemoDestination,
  isE164,
  isProductionDemoVoiceEnabled,
  isProductionPublicDemoVoiceEnabled,
  isVoiceDemoMode,
} from "@/lib/services/voice-config";

/** A job stuck in 'initiating' this long is treated as outcome_unknown, never re-dialled. */
const STUCK_INITIATING_MINUTES = 10;

interface ClaimedCall {
  follow_up_job_id: string;
  teacher_id: string;
  provider_request_id: string;
  /** Only populated in real mode; always null for demo calls. */
  teacher_phone: string | null;
}

interface VoiceConfiguration {
  mode: "demo" | "real";
  username: string;
  apiKey: string;
  callerId: string;
  /** The demo recipient (demo mode only). */
  destination: string | null;
  sandbox: boolean;
}

export interface FollowUpDispatchResult {
  follow_up_job_id: string;
  status: "provider_accepted" | "provider_rejected" | "outcome_unknown";
  error_code?: string;
  /** True when the call went to the demo number instead of a real teacher. */
  is_demo?: boolean;
}

export type FollowUpDispatchAuthorization =
  | { operatorAuthorized: true }
  | {
      publicDemoCallAuthorized: true;
      destinationOverride: string;
    };

/**
 * Submit at most one eligible call per invocation, after rechecking the schedule.
 * DEMO MODE: the call goes only to the configured demo number and no teacher
 * phone/consent is read (bypass for testing). REAL MODE: the teacher's stored phone
 * and consent are required by the claim query; a teacher without them is never called
 * and the demo number is never used as a fallback.
 * Idempotency: the atomic claim (FOR UPDATE SKIP LOCKED) flips queued -> initiating,
 * so concurrent workers, retries or repeated manual requests cannot dial a job twice.
 */
export async function dispatchOneDueFollowUp(
  now: Date = new Date(),
  teacherContext?: LogObservationContext,
  manualDemoJobId?: string,
  authorization?: FollowUpDispatchAuthorization,
): Promise<FollowUpDispatchResult | null> {
  const config = getVoiceConfiguration();
  const publicDemoAuthorization =
    authorization && "publicDemoCallAuthorized" in authorization
      ? authorization
      : null;
  const operatorAuthorized =
    authorization !== undefined &&
    "operatorAuthorized" in authorization &&
    authorization.operatorAuthorized;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.DIRA_DEMO_MODE === "true" &&
    operatorAuthorized !== true &&
    !publicDemoAuthorization
  ) {
    throw new Error("Production demo dispatch requires operator authorization");
  }
  if (
    publicDemoAuthorization &&
    (!isProductionPublicDemoVoiceEnabled() ||
      !isE164(publicDemoAuthorization.destinationOverride))
  ) {
    throw new Error("Public demo call destination is not authorized");
  }
  if (manualDemoJobId && (config.mode !== "demo" || !teacherContext)) {
    throw new Error("Manual demo dispatch requires an authorized demo context");
  }
  await markStuckInitiatingJobs(now);
  const claimed = await claimDueFollowUp(
    now,
    config.mode === "real",
    teacherContext,
    manualDemoJobId,
  );
  if (!claimed) {
    return null;
  }

  const destination = publicDemoAuthorization
    ? publicDemoAuthorization.destinationOverride
    : config.mode === "demo"
      ? config.destination
      : claimed.teacher_phone;
  if (!destination || !isE164(destination)) {
    // Safety net if contact data changed between the eligibility check and the claim;
    // nothing was sent, so the job returns to the queue instead of being lost.
    await pool.query(
      `UPDATE teacher_follow_up_jobs
       SET status = 'queued', attempt_count = GREATEST(attempt_count - 1, 0),
           last_error_code = 'missing_teacher_contact', updated_at = NOW()
       WHERE follow_up_job_id = $1 AND status = 'initiating'`,
      [claimed.follow_up_job_id],
    );
    return null;
  }

  try {
    const result = await initiateAfricaTalkingCall({
      username: config.username,
      apiKey: config.apiKey,
      callerId: config.callerId,
      destination,
      clientRequestId: claimed.provider_request_id,
      sandbox: config.sandbox,
      mode: config.mode,
      ...(publicDemoAuthorization ? { publicDemoAuthorized: true as const } : {}),
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

    await linkCallToJob(
      claimed.follow_up_job_id,
      claimed.teacher_id,
      result.sessionId ?? null,
      config.mode === "demo",
    );

    return {
      follow_up_job_id: claimed.follow_up_job_id,
      status: "provider_accepted",
      is_demo: config.mode === "demo",
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
      is_demo: config.mode === "demo",
    };
  }
}

/**
 * Create or complete the teacher_calls row for an accepted call.
 * A provider callback may already have created the row (keyed by sessionId) before
 * this runs, so this upserts and fills in the job/teacher link instead of inserting twice.
 * A call with no returned sessionId still gets a row, but callbacks cannot be matched to it.
 */
async function linkCallToJob(
  followUpJobId: string,
  teacherId: string,
  sessionId: string | null,
  isDemo: boolean,
): Promise<void> {
  if (sessionId) {
    await pool.query(
      `INSERT INTO teacher_calls
         (follow_up_job_id, teacher_id, provider_session_id, is_demo)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider_session_id) DO UPDATE
       SET follow_up_job_id = COALESCE(teacher_calls.follow_up_job_id, EXCLUDED.follow_up_job_id),
           teacher_id = COALESCE(teacher_calls.teacher_id, EXCLUDED.teacher_id),
           is_demo = EXCLUDED.is_demo,
           updated_at = NOW()`,
      [followUpJobId, teacherId, sessionId, isDemo],
    );
    return;
  }
  console.warn("Africa's Talking accepted a call without a sessionId; callbacks cannot be linked", {
    followUpJobId,
  });
  await pool.query(
    `INSERT INTO teacher_calls (follow_up_job_id, teacher_id, is_demo)
     VALUES ($1, $2, $3)
     ON CONFLICT (follow_up_job_id) WHERE follow_up_job_id IS NOT NULL DO NOTHING`,
    [followUpJobId, teacherId, isDemo],
  );
}

/**
 * Jobs left in 'initiating' (e.g. the process died mid-request) become outcome_unknown.
 * They are never retried automatically because the provider may already have dialled.
 */
async function markStuckInitiatingJobs(now: Date): Promise<void> {
  await pool.query(
    `UPDATE teacher_follow_up_jobs
     SET status = 'outcome_unknown', last_error_code = 'stuck_initiating', updated_at = NOW()
     WHERE status = 'initiating'
       AND attempt_started_at < $1::timestamptz - make_interval(mins => $2)`,
    [now, STUCK_INITIATING_MINUTES],
  );
}

/**
 * Refuse incomplete or unsafe provider configuration before claiming a job, and
 * decide demo vs real mode. Real mode is whatever demo mode is not: it never
 * borrows the demo number.
 */
function getVoiceConfiguration(): VoiceConfiguration {
  const mode = isVoiceDemoMode() ? "demo" : "real";
  if (
    process.env.NODE_ENV === "production" &&
    process.env.DIRA_DEMO_MODE === "true" &&
    mode !== "demo"
  ) {
    throw new Error("Real teacher calls are disabled in demo deployments");
  }
  const publicDemoEnabled =
    process.env.NODE_ENV === "production" &&
    isProductionPublicDemoVoiceEnabled();
  if (
    mode === "demo" &&
    process.env.NODE_ENV === "production" &&
    !isProductionDemoVoiceEnabled() &&
    !publicDemoEnabled
  ) {
    throw new Error("Production demo calling is not explicitly enabled");
  }

  // Voice uses its own live credentials; the SMS sandbox variables are never read here.
  const username = process.env.AFRICASTALKING_USERNAME_VOICE?.trim();
  const apiKey = process.env.AFRICASTALKING_API_KEY_VOICE?.trim();
  const callerId = process.env.AFRICASTALKING_VOICE_FROM?.trim();
  const destination = getVoiceDemoDestination() ?? null;

  if (!username || !apiKey || !callerId) {
    throw new Error(
      "Africa's Talking voice is not fully configured (AFRICASTALKING_USERNAME_VOICE, AFRICASTALKING_API_KEY_VOICE, AFRICASTALKING_VOICE_FROM)",
    );
  }
  if (mode === "demo" && !destination && !publicDemoEnabled) {
    throw new Error("Demo mode requires an explicit demo recipient number");
  }
  if (
    !isE164(callerId) ||
    (destination && !isE164(destination))
  ) {
    throw new Error("Africa's Talking caller and demo destination must be E.164 numbers");
  }

  return {
    mode,
    username,
    apiKey,
    callerId,
    destination: mode === "demo" ? destination : null,
    // Voice always targets the production endpoint (https://voice.africastalking.com/call).
    sandbox: false,
  };
}

/**
 * Claim one due row atomically so concurrent scheduler runs cannot dial twice.
 * In real mode the eligibility query also requires the teacher's stored phone and
 * consent, so jobs for teachers without them are simply never claimed.
 */
async function claimDueFollowUp(
  now: Date,
  requireTeacherContact: boolean,
  teacherContext?: LogObservationContext,
  manualDemoJobId?: string,
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
         LEFT JOIN school_calendar AS entry
           ON entry.calendar_entry_id = job.calendar_entry_id
         LEFT JOIN timetable_assignments AS assignment
           ON assignment.timetable_assignment_id = entry.timetable_assignment_id
         WHERE job.status = 'queued'
           AND job.scheduled_end_at <= $1
           AND ($3::text IS NULL OR job.teacher_id = $3)
           AND ($4::text IS NULL OR job.school_id = $4)
           AND (
             $5::boolean = FALSE
             OR EXISTS (
               SELECT 1 FROM teachers AS contact
               WHERE contact.teacher_id = job.teacher_id
                 AND contact.phone_e164 IS NOT NULL
                 AND contact.voice_consent_at IS NOT NULL
             )
           )
           AND (
             (
               $6::uuid IS NOT NULL
               AND job.follow_up_job_id = $6
               AND job.is_manual_demo = TRUE
               AND $5::boolean = FALSE
             )
             OR
             (
               $6::uuid IS NULL
               AND job.is_manual_demo = FALSE
               AND entry.school_id = job.school_id
               AND entry.class_id = job.class_id
               AND entry.teacher_id = job.teacher_id
               AND entry.calendar_date = job.scheduled_date
               AND entry.event_status = 'scheduled'
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
             )
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
                 job.provider_request_id::text AS provider_request_id,
                 CASE WHEN $5::boolean THEN
                   (SELECT phone_e164 FROM teachers WHERE teacher_id = job.teacher_id)
                 END AS teacher_phone`,
      [
        now,
        requestId,
        teacherContext?.teacher_id ?? null,
        teacherContext?.school_id ?? null,
        requireTeacherContact,
        manualDemoJobId ?? null,
      ],
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
