import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({
  initiateAfricaTalkingCall: vi.fn(async () => ({ httpStatus: 201 })),
}));

vi.mock("../lib/external-mcp/voice.ts", () => ({
  AfricaTalkingCallError: class AfricaTalkingCallError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  },
  initiateAfricaTalkingCall: provider.initiateAfricaTalkingCall,
}));

const { pool } = await import("../lib/db/client.ts");
const { dispatchOneDueFollowUp } = await import(
  "../lib/services/follow-up-dispatch.ts"
);
const { prepareDailyFollowUpQueue, listDueFollowUps } = await import(
  "../lib/services/follow-up-queue.ts"
);

const fixture = {
  suffix: randomUUID().replaceAll("-", ""),
  timezone: "Africa/Nairobi",
  saturday: new Date("2026-10-10T07:00:00.000Z"),
  mondayMorning: new Date("2026-10-12T04:00:00.000Z"),
  mondayAfterClass: new Date("2026-10-12T07:30:00.000Z"),
};
let fixtureStarted = false;

fixture.schoolId = `TESTQ_S_${fixture.suffix}`;
fixture.teacherId = `TESTQ_T_${fixture.suffix}`;
fixture.classId = `TESTQ_C_${fixture.suffix}`;
fixture.assignmentId = `TESTQ_A_${fixture.suffix}`;
fixture.calendarEntryId = `TESTQ_E_${fixture.suffix}`;

async function assertRequiredSchema() {
  const result = await pool.query(
    `SELECT
       to_regclass('public.schools') AS schools,
       to_regclass('public.teachers') AS teachers,
       to_regclass('public.classes') AS classes,
       to_regclass('public.timetable_assignments') AS timetable_assignments,
       to_regclass('public.school_calendar') AS school_calendar,
       to_regclass('public.school_closure_coverage') AS closure_coverage,
       to_regclass('public.school_closures') AS school_closures,
       to_regclass('public.teacher_follow_up_jobs') AS follow_up_jobs`,
  );
  const tables = result.rows[0];
  const missing = Object.entries(tables)
    .filter(([, value]) => value === null)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Development database is missing required tables: ${missing.join(", ")}. Apply the queue/call migrations before running these tests.`,
    );
  }
}

async function insertFixture() {
  await pool.query(
    `INSERT INTO schools (school_id, school_name, timezone)
     VALUES ($1, 'Temporary follow-up integration test school', $2)`,
    [fixture.schoolId, fixture.timezone],
  );
  await pool.query(
    `INSERT INTO teachers (teacher_id, school_id, display_name)
     VALUES ($1, $2, 'Temporary follow-up integration test teacher')`,
    [fixture.teacherId, fixture.schoolId],
  );
  await pool.query(
    `INSERT INTO classes (
       class_id, school_id, grade_level, stream_label, academic_year
     ) VALUES ($1, $2, 'Test grade', 'T', 2026)`,
    [fixture.classId, fixture.schoolId],
  );
  await pool.query(
    `INSERT INTO timetable_assignments (
       timetable_assignment_id, school_id, class_id, teacher_id,
       academic_year, weekday, period_number, start_time, end_time,
       subject, valid_from, valid_to
     ) VALUES ($1, $2, $3, $4, 2026, 1, 1, '08:00', '09:00',
               'Integration test', '2026-10-12', '2026-10-12')`,
    [
      fixture.assignmentId,
      fixture.schoolId,
      fixture.classId,
      fixture.teacherId,
    ],
  );
  await pool.query(
    `INSERT INTO school_calendar (
       calendar_entry_id, school_id, class_id, teacher_id,
       timetable_assignment_id, calendar_date, academic_year, term,
       weekday, period_number, start_time, end_time, subject, event_status
     ) VALUES ($1, $2, $3, $4, $5, '2026-10-12', 2026, 'test',
               1, 1, '08:00', '09:00', 'Integration test', 'scheduled')`,
    [
      fixture.calendarEntryId,
      fixture.schoolId,
      fixture.classId,
      fixture.teacherId,
      fixture.assignmentId,
    ],
  );
  await pool.query(
    `INSERT INTO school_closure_coverage (
       school_id, coverage_start, coverage_end, confirmed_at
     ) VALUES ($1, '2026-10-12', '2026-10-12', NOW())`,
    [fixture.schoolId],
  );
}

async function cleanupFixture() {
  // Call records reference the job, so remove them first (children before parents).
  await pool.query(
    `DELETE FROM call_events WHERE call_id IN (
       SELECT call_id FROM teacher_calls WHERE follow_up_job_id IN (
         SELECT follow_up_job_id FROM teacher_follow_up_jobs WHERE calendar_entry_id = $1))`,
    [fixture.calendarEntryId],
  );
  await pool.query(
    `DELETE FROM teacher_calls WHERE follow_up_job_id IN (
       SELECT follow_up_job_id FROM teacher_follow_up_jobs WHERE calendar_entry_id = $1)`,
    [fixture.calendarEntryId],
  );
  await pool.query(
    "DELETE FROM teacher_follow_up_jobs WHERE calendar_entry_id = $1",
    [fixture.calendarEntryId],
  );
  await pool.query(
    "DELETE FROM school_closure_coverage WHERE school_id = $1",
    [fixture.schoolId],
  );
  await pool.query(
    "DELETE FROM school_closures WHERE school_id = $1",
    [fixture.schoolId],
  );
  await pool.query(
    "DELETE FROM school_calendar WHERE calendar_entry_id = $1",
    [fixture.calendarEntryId],
  );
  await pool.query(
    "DELETE FROM timetable_assignments WHERE timetable_assignment_id = $1",
    [fixture.assignmentId],
  );
  await pool.query("DELETE FROM classes WHERE class_id = $1", [
    fixture.classId,
  ]);
  await pool.query("DELETE FROM teachers WHERE teacher_id = $1", [
    fixture.teacherId,
  ]);
  await pool.query("DELETE FROM schools WHERE school_id = $1", [
    fixture.schoolId,
  ]);
}

describe("follow-up queue and dispatch (local development PostgreSQL)", () => {
  beforeAll(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Outbound HTTP is disabled in integration tests");
      }),
    );
    await assertRequiredSchema();
    fixtureStarted = true;
    await insertFixture();
  });

  afterAll(async () => {
    try {
      if (fixtureStarted) {
        await cleanupFixture();
      }
    } finally {
      vi.unstubAllGlobals();
      await pool.end();
    }
  });

  it("skips queue preparation on Saturday even when triggered manually", async () => {
    const result = await prepareDailyFollowUpQueue(
      fixture.saturday,
      fixture.schoolId,
      fixture.teacherId,
    );

    expect(result.schools).toHaveLength(1);
    expect(result.schools[0]).toMatchObject({
      local_date: "2026-10-10",
      queued: 0,
      refreshed: 0,
      skipped_reason: "weekend",
    });

    const jobs = await pool.query(
      "SELECT 1 FROM teacher_follow_up_jobs WHERE calendar_entry_id = $1",
      [fixture.calendarEntryId],
    );
    expect(jobs.rowCount).toBe(0);
  });

  it("queues one eligible Monday class and remains idempotent on repeat", async () => {
    const firstRun = await prepareDailyFollowUpQueue(
      fixture.mondayMorning,
      fixture.schoolId,
      fixture.teacherId,
    );
    expect(firstRun.schools[0]).toMatchObject({
      local_date: "2026-10-12",
      queued: 1,
      refreshed: 1,
    });

    const secondRun = await prepareDailyFollowUpQueue(
      fixture.mondayMorning,
      fixture.schoolId,
      fixture.teacherId,
    );
    expect(secondRun.schools[0]).toMatchObject({
      local_date: "2026-10-12",
      queued: 1,
      refreshed: 1,
    });

    const jobs = await pool.query(
      `SELECT count(*)::int AS count, min(status) AS status
       FROM teacher_follow_up_jobs
       WHERE calendar_entry_id = $1`,
      [fixture.calendarEntryId],
    );
    expect(jobs.rows[0]).toEqual({ count: 1, status: "queued" });
  });

  it("lists the due test job and dispatches it through a mocked provider only", async () => {
    const dueJobs = await listDueFollowUps(
      fixture.teacherId,
      fixture.schoolId,
      fixture.mondayAfterClass,
    );
    expect(dueJobs).toHaveLength(1);

    const result = await dispatchOneDueFollowUp(fixture.mondayAfterClass, {
      teacher_id: fixture.teacherId,
      school_id: fixture.schoolId,
    });

    expect(result).toMatchObject({
      follow_up_job_id: dueJobs[0].follow_up_job_id,
      status: "provider_accepted",
    });
    expect(provider.initiateAfricaTalkingCall).toHaveBeenCalledTimes(1);

    const stored = await pool.query(
      `SELECT status, attempt_count
       FROM teacher_follow_up_jobs
       WHERE follow_up_job_id = $1`,
      [dueJobs[0].follow_up_job_id],
    );
    expect(stored.rows[0]).toEqual({
      status: "provider_accepted",
      attempt_count: 1,
    });
  });
});
