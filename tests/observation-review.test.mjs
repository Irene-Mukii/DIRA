import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { pool } = await import("../lib/db/client.ts");
const { reviewObservation } = await import(
  "../lib/services/observation-review.ts"
);

const suffix = randomUUID().replaceAll("-", "");
const fixture = {
  schoolId: `REVIEW_S_${suffix}`,
  authorId: `REVIEW_A_${suffix}`,
  reviewerId: `REVIEW_R_${suffix}`,
  outsiderId: `REVIEW_X_${suffix}`,
  classId: `REVIEW_C_${suffix}`,
  learnerId: `REVIEW_L_${suffix}`,
  observationId: `REVIEW_O_${suffix}`,
  editedObservationId: `REVIEW_E_${suffix}`,
};
let fixtureStarted = false;

async function insertFixture() {
  await pool.query(
    `INSERT INTO schools (school_id, school_name)
     VALUES ($1, 'Temporary observation review integration test school')`,
    [fixture.schoolId],
  );
  for (const teacherId of [
    fixture.authorId,
    fixture.reviewerId,
    fixture.outsiderId,
  ]) {
    await pool.query(
      `INSERT INTO teachers (teacher_id, school_id, display_name)
       VALUES ($1, $2, 'Temporary observation review integration test teacher')`,
      [teacherId, fixture.schoolId],
    );
  }
  await pool.query(
    `INSERT INTO classes (
       class_id, school_id, grade_level, stream_label, academic_year
     ) VALUES ($1, $2, 'Review test', 'T', EXTRACT(YEAR FROM CURRENT_DATE)::int)`,
    [fixture.classId, fixture.schoolId],
  );
  await pool.query(
    `INSERT INTO learners (learner_id, display_name)
     VALUES ($1, 'Temporary review integration test learner')`,
    [fixture.learnerId],
  );
  await pool.query(
    `INSERT INTO learner_enrollments (
       learner_id, class_id, school_id, academic_year, enrolment_status,
       enrolled_from, enrolled_to
     ) VALUES (
       $1, $2, $3, EXTRACT(YEAR FROM CURRENT_DATE)::int, 'Active',
       CURRENT_DATE - 1, CURRENT_DATE + 1
     )`,
    [fixture.learnerId, fixture.classId, fixture.schoolId],
  );
  for (const [teacherId, period] of [
    [fixture.authorId, 1],
    [fixture.reviewerId, 2],
  ]) {
    await pool.query(
      `INSERT INTO timetable_assignments (
         timetable_assignment_id, school_id, class_id, teacher_id,
         academic_year, weekday, period_number, start_time, end_time,
         subject, valid_from, valid_to
       ) VALUES (
         $1, $2, $3, $4, EXTRACT(YEAR FROM CURRENT_DATE)::int,
         2, $5, '08:00', '09:00', 'Review test', CURRENT_DATE - 1, CURRENT_DATE + 1
       )`,
      [
        `${fixture.classId}_${teacherId}`,
        fixture.schoolId,
        fixture.classId,
        teacherId,
        period,
      ],
    );
  }
  for (const observationId of [
    fixture.observationId,
    fixture.editedObservationId,
  ]) {
    await pool.query(
      `INSERT INTO observations (
         observation_id, learner_id, teacher_id, school_id, class_id,
         academic_year, observation_date, observed_at, observation_type,
         original_observation, source_type, capture_method, submission_id,
         teacher_review_status
       ) VALUES (
         $1, $2, $3, $4, $5, EXTRACT(YEAR FROM CURRENT_DATE)::int,
         CURRENT_DATE, NOW(), 'academic', 'Initial review test observation',
         'Phone callback', 'basic_phone_callback', $6, 'recorded'
       )`,
      [
        observationId,
        fixture.learnerId,
        fixture.authorId,
        fixture.schoolId,
        fixture.classId,
        `submission:${observationId}`,
      ],
    );
  }
}

async function cleanupFixture() {
  await pool.query(
    `DELETE FROM observation_review_history
     WHERE observation_id = ANY($1::text[])`,
    [[fixture.observationId, fixture.editedObservationId]],
  );
  await pool.query(
    `DELETE FROM observations WHERE observation_id = ANY($1::text[])`,
    [[fixture.observationId, fixture.editedObservationId]],
  );
  await pool.query("DELETE FROM timetable_assignments WHERE class_id = $1", [
    fixture.classId,
  ]);
  await pool.query("DELETE FROM learner_enrollments WHERE learner_id = $1", [
    fixture.learnerId,
  ]);
  await pool.query("DELETE FROM learners WHERE learner_id = $1", [
    fixture.learnerId,
  ]);
  await pool.query("DELETE FROM classes WHERE class_id = $1", [fixture.classId]);
  await pool.query("DELETE FROM teachers WHERE school_id = $1", [
    fixture.schoolId,
  ]);
  await pool.query("DELETE FROM schools WHERE school_id = $1", [
    fixture.schoolId,
  ]);
}

beforeAll(async () => {
  fixtureStarted = true;
  await insertFixture();
});

afterAll(async () => {
  if (fixtureStarted) {
    await cleanupFixture().catch((error) =>
      console.error("observation review test cleanup failed:", error),
    );
  }
  await pool.end();
});

describe("observation review persistence", () => {
  const reviewerContext = () => ({
    teacher_id: fixture.reviewerId,
    school_id: fixture.schoolId,
  });

  it("allows an assigned class teacher to confirm and safely retry a recorded observation", async () => {
    const input = {
      submission_id: `review:${randomUUID()}`,
      review_status: "confirmed",
    };
    const first = await reviewObservation(
      fixture.observationId,
      input,
      reviewerContext(),
    );
    const duplicate = await reviewObservation(
      fixture.observationId,
      input,
      reviewerContext(),
    );

    expect(first.duplicate).toBe(false);
    expect(first.observation.teacher_review_status).toBe("confirmed");
    expect(first.observation.teacher_id).toBe(fixture.authorId);
    expect(first.observation.reviewed_by_teacher_id).toBe(fixture.reviewerId);
    expect(duplicate.duplicate).toBe(true);

    const persisted = await pool.query(
      `SELECT teacher_review_status, teacher_id, reviewed_by_teacher_id
       FROM observations WHERE observation_id = $1`,
      [fixture.observationId],
    );
    expect(persisted.rows[0]).toEqual({
      teacher_review_status: "confirmed",
      teacher_id: fixture.authorId,
      reviewed_by_teacher_id: fixture.reviewerId,
    });
  });

  it("persists an edit without changing learner, author, or review identity", async () => {
    const result = await reviewObservation(
      fixture.editedObservationId,
      {
        submission_id: `review:${randomUUID()}`,
        review_status: "updated",
        content: "Teacher-edited observation details",
        observation_type: "participation",
      },
      reviewerContext(),
    );

    expect(result.observation.teacher_review_status).toBe("updated");
    expect(result.observation.reviewed_observation).toBe(
      "Teacher-edited observation details",
    );
    expect(result.observation.learner_id).toBe(fixture.learnerId);
    expect(result.observation.teacher_id).toBe(fixture.authorId);
    expect(result.observation.reviewed_by_teacher_id).toBe(fixture.reviewerId);
  });

  it("rejects a teacher who is not assigned to the observation's class", async () => {
    await expect(
      reviewObservation(
        fixture.observationId,
        {
          submission_id: `review:${randomUUID()}`,
          review_status: "confirmed",
        },
        { teacher_id: fixture.outsiderId, school_id: fixture.schoolId },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
