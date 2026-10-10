import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "@/lib/db/client";

interface SchoolRow {
  school_id: string;
  timezone: string | null;
}

interface ScheduleCandidate {
  calendar_entry_id: string;
  school_id: string;
  class_id: string;
  teacher_id: string;
  scheduled_date: string;
  scheduled_end_at: Date;
}

interface SchoolQueueResult {
  school_id: string;
  local_date: string;
  queued: number;
  refreshed: number;
  skipped_reason?: "weekend" | "school_closed";
  blocked_reason?: string;
}

const VALID_SCHEDULE_SQL = `
  SELECT
    entry.calendar_entry_id,
    entry.school_id,
    entry.class_id,
    entry.teacher_id,
    entry.calendar_date::text AS scheduled_date,
    (entry.calendar_date + entry.end_time) AT TIME ZONE $3 AS scheduled_end_at
  FROM school_calendar AS entry
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
  WHERE entry.school_id = $1
    AND entry.calendar_date = $2::date
    AND ($4::text IS NULL OR entry.teacher_id = $4)
    AND entry.event_status = 'scheduled'
    AND entry.weekday = EXTRACT(ISODOW FROM entry.calendar_date)::smallint
    AND entry.end_time > entry.start_time
    AND NOT EXISTS (
      SELECT 1
      FROM school_calendar AS overlapping
      WHERE overlapping.school_id = entry.school_id
        AND overlapping.teacher_id = entry.teacher_id
        AND overlapping.calendar_date = entry.calendar_date
        AND overlapping.calendar_entry_id <> entry.calendar_entry_id
        AND overlapping.event_status = 'scheduled'
        AND overlapping.start_time < entry.end_time
        AND overlapping.end_time > entry.start_time
    )
  ORDER BY entry.end_time, entry.teacher_id, entry.calendar_entry_id
`;

/**
 * Prepare today's follow-up queue from each school's local date.
 * This creates database jobs only; it never starts a voice call.
 */
export async function prepareDailyFollowUpQueue(
  now: Date = new Date(),
  schoolId?: string,
  teacherId?: string,
): Promise<{ generated_at: string; schools: SchoolQueueResult[] }> {
  const schoolResult = schoolId
    ? await pool.query<SchoolRow>(
        "SELECT school_id, timezone FROM schools WHERE school_id = $1 ORDER BY school_id",
        [schoolId],
      )
    : await pool.query<SchoolRow>(
        "SELECT school_id, timezone FROM schools ORDER BY school_id",
      );
  if (schoolResult.rows.length === 0) {
    throw new Error("No schools are configured for follow-up scheduling");
  }

  const schools: SchoolQueueResult[] = [];
  for (const school of schoolResult.rows) {
    if (!school.timezone) {
      schools.push({
        school_id: school.school_id,
        local_date: "",
        queued: 0,
        refreshed: 0,
        blocked_reason: "School timezone is not configured",
      });
      continue;
    }

    const localDate = getLocalDate(now, school.timezone);
    if (!localDate) {
      schools.push({
        school_id: school.school_id,
        local_date: "",
        queued: 0,
        refreshed: 0,
        blocked_reason: "School timezone is not a valid IANA timezone",
      });
      continue;
    }

    if (!isWeekday(localDate)) {
      schools.push({
        school_id: school.school_id,
        local_date: localDate,
        queued: 0,
        refreshed: 0,
        skipped_reason: "weekend",
      });
      continue;
    }

    schools.push(
      await prepareSchoolQueue(
        { ...school, timezone: school.timezone },
        localDate,
        teacherId,
      ),
    );
  }

  return { generated_at: now.toISOString(), schools };
}

export interface DueFollowUp {
  follow_up_job_id: string;
  scheduled_date: string;
  scheduled_end_at: Date;
  status: string;
}

export async function listDueFollowUps(
  teacherId: string,
  schoolId: string,
  now: Date = new Date(),
  limit = 10,
): Promise<DueFollowUp[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("Due follow-up limit must be between 1 and 20");
  }

  const result = await pool.query<DueFollowUp>(
    `SELECT follow_up_job_id, scheduled_date::text, scheduled_end_at, status
     FROM teacher_follow_up_jobs
     WHERE teacher_id = $1
       AND school_id = $2
       AND status = 'queued'
       AND scheduled_end_at <= $3
     ORDER BY scheduled_end_at, follow_up_job_id
     LIMIT $4`,
    [teacherId, schoolId, now, limit],
  );

  return result.rows;
}

/**
 * Atomically validate and enqueue one school's schedule for its local date.
 */
async function prepareSchoolQueue(
  school: SchoolRow & { timezone: string },
  localDate: string,
  teacherId?: string,
): Promise<SchoolQueueResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockSchoolQueue(client, school.school_id, localDate);

    const coverage = await client.query(
      `SELECT 1
       FROM school_closure_coverage
       WHERE school_id = $1
         AND coverage_start <= $2::date
         AND coverage_end >= $2::date
         AND confirmed_at IS NOT NULL
       LIMIT 1`,
      [school.school_id, localDate],
    );
    if (coverage.rowCount === 0) {
      await client.query("ROLLBACK");
      return {
        school_id: school.school_id,
        local_date: localDate,
        queued: 0,
        refreshed: 0,
        blocked_reason: "School closure calendar is not confirmed for this date",
      };
    }

    const closure = await client.query(
      `SELECT 1
       FROM school_closures
       WHERE school_id = $1 AND closure_date = $2::date
       LIMIT 1`,
      [school.school_id, localDate],
    );
    if ((closure.rowCount ?? 0) > 0) {
      await client.query(
        `UPDATE teacher_follow_up_jobs
         SET status = 'cancelled',
             cancel_reason = 'School closure',
             updated_at = NOW()
         WHERE school_id = $1
           AND scheduled_date = $2::date
           AND ($3::text IS NULL OR teacher_id = $3)
           AND status = 'queued'`,
        [school.school_id, localDate, teacherId ?? null],
      );
      await client.query("COMMIT");
      return {
        school_id: school.school_id,
        local_date: localDate,
        queued: 0,
        refreshed: 0,
        skipped_reason: "school_closed",
      };
    }

    const candidates = await client.query<ScheduleCandidate>(
      VALID_SCHEDULE_SQL,
      [school.school_id, localDate, school.timezone, teacherId ?? null],
    );
    const validEntryIds = candidates.rows.map(
      (candidate) => candidate.calendar_entry_id,
    );

    await client.query(
      `UPDATE teacher_follow_up_jobs
       SET status = 'cancelled',
           cancel_reason = 'Schedule no longer validates',
           updated_at = NOW()
       WHERE school_id = $1
         AND scheduled_date = $2::date
         AND status = 'queued'
         AND ($4::text IS NULL OR teacher_id = $4)
         AND NOT (calendar_entry_id = ANY($3::text[]))`,
      [school.school_id, localDate, validEntryIds, teacherId ?? null],
    );

    let refreshed = 0;
    for (const candidate of candidates.rows) {
      const idempotencyKey = createHash("sha256")
        .update(
          `${candidate.calendar_entry_id}:${candidate.teacher_id}:${candidate.scheduled_end_at.toISOString()}`,
        )
        .digest("hex");
      const result = await client.query(
        `INSERT INTO teacher_follow_up_jobs (
           calendar_entry_id,
           school_id,
           class_id,
           teacher_id,
           scheduled_date,
           scheduled_end_at,
           idempotency_key
         )
         VALUES ($1, $2, $3, $4, $5::date, $6, $7)
         ON CONFLICT (calendar_entry_id) DO UPDATE
         SET school_id = EXCLUDED.school_id,
             class_id = EXCLUDED.class_id,
             teacher_id = EXCLUDED.teacher_id,
             scheduled_date = EXCLUDED.scheduled_date,
             scheduled_end_at = EXCLUDED.scheduled_end_at,
             idempotency_key = EXCLUDED.idempotency_key,
             status = 'queued',
             cancel_reason = NULL,
             updated_at = NOW()
         WHERE teacher_follow_up_jobs.status = 'queued'
            OR (
              teacher_follow_up_jobs.status = 'cancelled'
              AND teacher_follow_up_jobs.cancel_reason = 'Schedule no longer validates'
            )`,
        [
          candidate.calendar_entry_id,
          candidate.school_id,
          candidate.class_id,
          candidate.teacher_id,
          candidate.scheduled_date,
          candidate.scheduled_end_at,
          idempotencyKey,
        ],
      );
      refreshed += result.rowCount ?? 0;
    }

    const queuedJobs = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM teacher_follow_up_jobs
       WHERE school_id = $1
         AND scheduled_date = $2::date
         AND ($3::text IS NULL OR teacher_id = $3)
         AND status = 'queued'`,
      [school.school_id, localDate, teacherId ?? null],
    );

    await client.query("COMMIT");
    return {
      school_id: school.school_id,
      local_date: localDate,
      queued: Number(queuedJobs.rows[0]?.count ?? "0"),
      refreshed,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Follow-up queue preparation failed and rollback also failed",
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Serialize scheduler retries for the same school and local date.
 */
async function lockSchoolQueue(
  client: PoolClient,
  schoolId: string,
  localDate: string,
): Promise<void> {
  // A transaction-scoped lock makes concurrent/retried daily triggers safe.
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`teacher-follow-up:${schoolId}:${localDate}`],
  );
}

/** Convert an instant to a date string in the school's configured timezone. */
function getLocalDate(date: Date, timezone: string): string | null {
  // Use the school's timezone, not the server process's local timezone.
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const year = values.get("year");
    const month = values.get("month");
    const day = values.get("day");
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

/** Check the ISO weekday represented by a date-only string. */
function isWeekday(localDate: string): boolean {
  // Date-only values are evaluated in UTC to avoid another timezone conversion.
  const day = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
  return day >= 1 && day <= 5;
}
