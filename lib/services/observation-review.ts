import { pool } from "@/lib/db/client";
import {
  OBSERVATION_TYPES,
  type LogObservationContext,
  type ObservationRecord,
  type ReviewObservationInput,
} from "@/lib/db/schema";
import { ObservationError } from "@/lib/mcp-tools/logObservation";

interface ReviewHistoryRow {
  observation_id: string;
  reviewer_id: string;
  review_status: "confirmed" | "updated";
  updated_text: string | null;
  updated_observation_type: string | null;
  updated_linked_test_id: string | null;
}

function validateReview(input: ReviewObservationInput): void {
  if (!input.submission_id.trim() || input.submission_id.length > 200) {
    throw new ObservationError("A valid submission_id is required", 400);
  }
  if (input.review_status === "updated") {
    if (typeof input.content !== "string" || !input.content.trim()) {
      throw new ObservationError("Updated observation content is required", 400);
    }
    if (input.content.length > 20_000) {
      throw new ObservationError("Observation content is too long", 400);
    }
    if (
      input.observation_type !== undefined &&
      !(OBSERVATION_TYPES as readonly string[]).includes(input.observation_type)
    ) {
      throw new ObservationError("Invalid observation_type", 400);
    }
  }
}

export async function reviewObservation(
  observationId: string,
  input: ReviewObservationInput,
  context: LogObservationContext,
): Promise<{ observation: ObservationRecord; duplicate: boolean }> {
  validateReview(input);
  if (!context.teacher_id.trim() || !context.school_id.trim()) {
    throw new ObservationError("A trusted teacher and school context is required", 503);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const teacher = await client.query(
      `SELECT teacher_id FROM teachers
       WHERE teacher_id = $1 AND school_id = $2`,
      [context.teacher_id, context.school_id],
    );
    if (!teacher.rowCount) {
      throw new ObservationError("Teacher is not registered for this school", 403);
    }

    const duplicate = await client.query<ReviewHistoryRow>(
      `SELECT observation_id, reviewer_id, review_status, updated_text,
              updated_observation_type, updated_linked_test_id
       FROM observation_review_history
       WHERE submission_id = $1`,
      [input.submission_id.trim()],
    );
    if (duplicate.rows[0]) {
      const prior = duplicate.rows[0];
      const contentMatches = input.review_status === "confirmed"
        ? prior.updated_text === null
        : prior.updated_text === input.content?.trim();
      if (
        prior.observation_id !== observationId ||
        prior.reviewer_id !== context.teacher_id ||
        prior.review_status !== input.review_status ||
        !contentMatches ||
        (input.observation_type !== undefined &&
          prior.updated_observation_type !== input.observation_type) ||
        (input.linked_test_id !== undefined &&
          prior.updated_linked_test_id !== (input.linked_test_id?.trim() || null))
      ) {
        throw new ObservationError("submission_id has already been used for a different review", 409);
      }
      const saved = await client.query<ObservationRecord>(
        `SELECT * FROM observations
         WHERE observation_id = $1 AND school_id = $2 AND teacher_id = $3`,
        [observationId, context.school_id, context.teacher_id],
      );
      if (!saved.rows[0]) {
        throw new ObservationError("Observation not found", 404);
      }
      await client.query("COMMIT");
      return { observation: saved.rows[0], duplicate: true };
    }

    // Locking the row makes review submission a one-way, retry-safe transition.
    const result = await client.query<ObservationRecord>(
      `SELECT * FROM observations
       WHERE observation_id = $1 AND school_id = $2 AND teacher_id = $3
       FOR UPDATE`,
      [observationId, context.school_id, context.teacher_id],
    );
    const observation = result.rows[0];
    if (!observation) {
      throw new ObservationError("Observation not found", 404);
    }
    if (observation.teacher_review_status !== "recorded") {
      throw new ObservationError("This observation has already been reviewed", 409);
    }

    const status = input.review_status;
    const updatedText = status === "updated" ? input.content!.trim() : null;
    const updatedType = status === "updated"
      ? input.observation_type ?? observation.observation_type
      : observation.observation_type;
    const updatedTestId = status === "updated"
      ? input.linked_test_id === undefined
        ? observation.linked_test_id
        : input.linked_test_id?.trim() || null
      : observation.linked_test_id;

    if (updatedTestId) {
      const test = await client.query(
        `SELECT test_id FROM activity_tests
         WHERE test_id = $1 AND learner_id = $2`,
        [updatedTestId, observation.learner_id],
      );
      if (!test.rowCount) {
        throw new ObservationError("The linked test does not belong to this learner", 400);
      }
    }

    await client.query(
      `INSERT INTO observation_review_history (
         submission_id, observation_id, reviewer_id, review_status,
         previous_text, updated_text, previous_observation_type,
         updated_observation_type, previous_linked_test_id,
         updated_linked_test_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.submission_id.trim(),
        observationId,
        context.teacher_id,
        status,
        observation.reviewed_observation ?? observation.original_observation,
        updatedText,
        observation.observation_type,
        status === "updated" ? updatedType : null,
        observation.linked_test_id,
        status === "updated" ? updatedTestId : null,
      ],
    );

    const saved = await client.query<ObservationRecord>(
      `UPDATE observations
       SET teacher_review_status = $2,
           reviewed_observation = $3,
           observation_type = $4,
           linked_test_id = $5,
           reviewed_by_teacher_id = $6,
           reviewed_at = NOW()
       WHERE observation_id = $1
       RETURNING *`,
      [
        observationId,
        status,
        updatedText,
        updatedType,
        updatedTestId,
        context.teacher_id,
      ],
    );
    await client.query("COMMIT");
    return { observation: saved.rows[0], duplicate: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
