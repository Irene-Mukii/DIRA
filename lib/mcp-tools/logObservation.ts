import { pool } from "../db/client";
import {
  CAPTURE_METHODS,
  OBSERVATION_TYPES,
  type LogObservationContext,
  type LogObservationInput,
  type ObservationRecord,
} from "../db/schema";

export class ObservationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ObservationError";
  }
}

function validateInput(input: LogObservationInput): Date {
  if (typeof input.learner_id !== "string" || !input.learner_id.trim()) {
    throw new ObservationError("learner_id is required", 400);
  }
  if (typeof input.content !== "string" || !input.content.trim()) {
    throw new ObservationError("content is required", 400);
  }
  if (input.content.length > 20_000) {
    throw new ObservationError("content is too long", 400);
  }
  if (!(OBSERVATION_TYPES as readonly string[]).includes(input.observation_type)) {
    throw new ObservationError("Invalid observation_type", 400);
  }
  if (!(CAPTURE_METHODS as readonly string[]).includes(input.capture_method)) {
    throw new ObservationError("Invalid capture_method", 400);
  }
  if (
    typeof input.submission_id !== "string" ||
    !input.submission_id.trim() ||
    input.submission_id.length > 200
  ) {
    throw new ObservationError("A valid submission_id is required", 400);
  }
  if (
    typeof input.observed_at !== "string" ||
    !input.observed_at.trim() ||
    !Number.isFinite(Date.parse(input.observed_at))
  ) {
    throw new ObservationError("observed_at must be a valid date/time", 400);
  }
  for (const [name, value] of [
    ["calendar_entry_id", input.calendar_entry_id],
    ["subject", input.subject],
    ["term", input.term],
    ["activity_context", input.activity_context],
    ["linked_test_id", input.linked_test_id],
    ["recording_reference", input.recording_reference],
    ["transcript_text", input.transcript_text],
    ["transcription_provider", input.transcription_provider],
  ] as const) {
    if (value !== undefined && typeof value !== "string") {
      throw new ObservationError(`${name} must be a string`, 400);
    }
    if (typeof value === "string" && value.length > 20_000) {
      throw new ObservationError(`${name} is too long`, 400);
    }
  }
  return new Date(input.observed_at);
}

function sameSubmission(
  existing: ObservationRecord,
  input: LogObservationInput,
  context: LogObservationContext,
  observedAt: Date,
): boolean {
  return (
    existing.learner_id === input.learner_id.trim() &&
    existing.teacher_id === context.teacher_id &&
    existing.school_id === context.school_id &&
    existing.observation_type === input.observation_type &&
    existing.original_observation === input.content &&
    existing.observed_at.getTime() === observedAt.getTime() &&
    existing.calendar_entry_id === (input.calendar_entry_id?.trim() || null) &&
    (input.subject === undefined ||
      existing.subject === (input.subject.trim() || null)) &&
    (input.term === undefined || existing.term === (input.term.trim() || null)) &&
    existing.activity_context === (input.activity_context?.trim() || null) &&
    existing.capture_method === input.capture_method &&
    existing.recording_reference === (input.recording_reference?.trim() || null) &&
    existing.transcript_text === (
      input.transcript_text?.trim() ||
      (input.capture_method === "in_app_voice" ||
      input.capture_method === "basic_phone_callback" ? input.content.trim() : null)
    ) &&
    existing.transcription_provider === (input.transcription_provider?.trim() || null) &&
    existing.linked_test_id === (input.linked_test_id?.trim() || null)
  );
}

function sourceTypeFor(captureMethod: LogObservationInput["capture_method"]): string {
  switch (captureMethod) {
    case "in_app_voice":
      return "Voice transcription";
    case "basic_phone_callback":
      return "Phone callback";
    case "text":
    case "other":
      return "Text note";
  }
}

export async function logObservation(
  input: LogObservationInput,
  context: LogObservationContext,
): Promise<{ observation: ObservationRecord; duplicate: boolean }> {
  const observedAt = validateInput(input);
  if (!context.teacher_id.trim() || !context.school_id.trim()) {
    throw new ObservationError("A trusted teacher and school context is required", 503);
  }

  const learnerId = input.learner_id.trim();
  const submissionId = input.submission_id.trim();
  const observationDate = observedAt.toISOString().slice(0, 10);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const teacher = await client.query(
      `SELECT teacher_id
       FROM teachers
       WHERE teacher_id = $1 AND school_id = $2`,
      [context.teacher_id, context.school_id],
    );
    if (teacher.rowCount === 0) {
      throw new ObservationError("Teacher is not registered for this school", 403);
    }

    const existing = await client.query<ObservationRecord>(
      "SELECT * FROM observations WHERE submission_id = $1",
      [submissionId],
    );
    if (existing.rows[0]) {
      const previous = existing.rows[0];
      if (!sameSubmission(previous, input, context, observedAt)) {
        throw new ObservationError(
          "submission_id has already been used for different data",
          409,
        );
      }
      await client.query("COMMIT");
      return { observation: previous, duplicate: true };
    }

    const enrollment = await client.query<{
      class_id: string;
      academic_year: number;
    }>(
      `SELECT e.class_id, e.academic_year
       FROM learner_enrollments e
       JOIN classes c
         ON c.class_id = e.class_id
        AND c.school_id = e.school_id
        AND c.academic_year = e.academic_year
       WHERE e.learner_id = $1
         AND e.school_id = $2
         AND e.enrolled_from <= $3::date
         AND (e.enrolled_to IS NULL OR e.enrolled_to >= $3::date)
       ORDER BY e.academic_year DESC
       LIMIT 1`,
      [learnerId, context.school_id, observationDate],
    );
    const learnerClass = enrollment.rows[0];
    if (!learnerClass) {
      throw new ObservationError("Learner is not enrolled at the observation date", 404);
    }

    let subject = input.subject?.trim() || null;
    let term = input.term?.trim() || null;
    const calendarEntryId = input.calendar_entry_id?.trim() || null;

    if (calendarEntryId) {
      const session = await client.query<{ subject: string; term: string }>(
        `SELECT subject, term
         FROM school_calendar
         WHERE calendar_entry_id = $1
           AND school_id = $2
           AND class_id = $3
           AND teacher_id = $4
           AND academic_year = $5
           AND calendar_date = $6::date`,
        [
          calendarEntryId,
          context.school_id,
          learnerClass.class_id,
          context.teacher_id,
          learnerClass.academic_year,
          observationDate,
        ],
      );
      if (session.rowCount === 0) {
        throw new ObservationError(
          "The scheduled period does not match this learner, teacher, and date",
          400,
        );
      }
      subject ??= session.rows[0].subject;
      term ??= session.rows[0].term;
    }

    const linkedTestId = input.linked_test_id?.trim() || null;
    if (linkedTestId) {
      const test = await client.query(
        "SELECT test_id FROM activity_tests WHERE test_id = $1 AND learner_id = $2",
        [linkedTestId, learnerId],
      );
      if (test.rowCount === 0) {
        throw new ObservationError("The linked test does not belong to this learner", 400);
      }
    }

    const inserted = await client.query<ObservationRecord>(
      `INSERT INTO observations (
        learner_id,
        teacher_id,
        school_id,
        class_id,
        academic_year,
        observation_date,
        observed_at,
        term,
        calendar_entry_id,
        observation_type,
        original_observation,
        subject,
        activity_context,
        source_type,
        capture_method,
        submission_id,
        linked_test_id,
        recording_reference,
        transcript_text,
        transcription_provider,
        transcription_status,
        teacher_review_status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19, $20,
        CASE WHEN $15 IN ('in_app_voice', 'basic_phone_callback') THEN 'completed' ELSE NULL END,
        CASE WHEN $15 IN ('in_app_voice', 'basic_phone_callback') THEN 'recorded' ELSE 'not_required' END
      )
      ON CONFLICT (submission_id) DO NOTHING
      RETURNING *`,
      [
        learnerId,
        context.teacher_id,
        context.school_id,
        learnerClass.class_id,
        learnerClass.academic_year,
        observationDate,
        observedAt,
        term,
        calendarEntryId,
        input.observation_type,
        input.content,
        subject,
        input.activity_context?.trim() || null,
        sourceTypeFor(input.capture_method),
        input.capture_method,
        submissionId,
        linkedTestId,
        input.recording_reference?.trim() || null,
        input.transcript_text?.trim() ||
          (input.capture_method === "in_app_voice" ||
          input.capture_method === "basic_phone_callback" ? input.content.trim() : null),
        input.transcription_provider?.trim() || null,
      ],
    );

    if (inserted.rows[0]) {
      await client.query("COMMIT");
      return { observation: inserted.rows[0], duplicate: false };
    }

    const conflict = await client.query<ObservationRecord>(
      "SELECT * FROM observations WHERE submission_id = $1",
      [submissionId],
    );
    const previous = conflict.rows[0];
    if (!previous || !sameSubmission(previous, input, context, observedAt)) {
      throw new ObservationError(
        "submission_id has already been used for different data",
        409,
      );
    }

    await client.query("COMMIT");
    return { observation: previous, duplicate: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
