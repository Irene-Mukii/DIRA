import { pool } from "../db/client";
import {
  CAPTURE_METHODS,
  OBSERVATION_TYPES,
  type LogObservationInput,
  type ObservationRecord,
} from "../db/schema";

const DEMO_OBSERVER_ID = "local-demo-teacher";

export class ObservationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ObservationError";
  }
}

export async function logObservation(
  input: LogObservationInput,
): Promise<{
  observation: ObservationRecord;
  duplicate: boolean;
}> {
  if (
    typeof input.learner_id !== "string" ||
    !input.learner_id.trim()
  ) {
    throw new ObservationError("learner_id is required", 400);
  }

  if (
    typeof input.content !== "string" ||
    !input.content.trim()
  ) {
    throw new ObservationError("content is required", 400);
  }

  if (input.content.length > 20_000) {
    throw new ObservationError("content is too long", 400);
  }

  if (
    !OBSERVATION_TYPES.includes(input.observation_type)
  ) {
    throw new ObservationError("Invalid observation_type", 400);
  }

  if (
    !CAPTURE_METHODS.includes(input.capture_method)
  ) {
    throw new ObservationError("Invalid capture_method", 400);
  }

  if (
    typeof input.submission_id !== "string" ||
    !input.submission_id.trim() ||
    input.submission_id.length > 200
  ) {
    throw new ObservationError(
      "A valid submission_id is required",
      400,
    );
  }

  if (
    input.observed_at !== undefined &&
    (
      typeof input.observed_at !== "string" ||
      !input.observed_at.trim() ||
      !Number.isFinite(Date.parse(input.observed_at))
    )
  ) {
    throw new ObservationError(
      "observed_at must be a valid date/time",
      400,
    );
  }

  const observedAt = input.observed_at
    ? new Date(input.observed_at)
    : null;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const learner = await client.query(
      "SELECT learner_id FROM learners WHERE learner_id = $1",
      [input.learner_id.trim()],
    );

    if (learner.rowCount === 0) {
      throw new ObservationError("Learner not found", 404);
    }

    const inserted = await client.query<ObservationRecord>(
      `INSERT INTO observations (
        learner_id,
        observer_id,
        observer_role,
        observation_type,
        content_original,
        subject,
        term,
        observed_at,
        capture_method,
        submission_id,
        linked_test_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (submission_id) DO NOTHING
      RETURNING *`,
      [
        input.learner_id.trim(),
        DEMO_OBSERVER_ID,
        "teacher",
        input.observation_type,
        input.content,
        input.subject?.trim() || null,
        input.term?.trim() || null,
        observedAt,
        input.capture_method,
        input.submission_id.trim(),
        input.linked_test_id?.trim() || null,
      ],
    );

    if (inserted.rows[0]) {
      await client.query("COMMIT");
      return {
        observation: inserted.rows[0],
        duplicate: false,
      };
    }

    const existing = await client.query<ObservationRecord>(
      `SELECT * FROM observations WHERE submission_id = $1`,
      [input.submission_id.trim()],
    );

    const previous = existing.rows[0];

    if (
      !previous ||
      previous.learner_id !== input.learner_id.trim() ||
      previous.observation_type !== input.observation_type ||
      previous.content_original !== input.content
    ) {
      throw new ObservationError(
        "submission_id has already been used for different data",
        409,
      );
    }

    await client.query("COMMIT");

    return {
      observation: previous,
      duplicate: true,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
