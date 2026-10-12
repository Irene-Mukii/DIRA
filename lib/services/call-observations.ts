import "server-only";

import { pool } from "@/lib/db/client";
import {
  OBSERVATION_TYPES,
  type LogObservationContext,
  type ObservationType,
} from "@/lib/db/schema";
import { logObservation } from "@/lib/mcp-tools/logObservation";

/**
 * Observation drafts created from a call transcript.
 * Drafts are only proposals: nothing becomes a real observation until the teacher
 * confirms it, and a learner is never chosen when the name is ambiguous.
 */

export class DraftError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "DraftError";
  }
}

export interface DraftSegmentInput {
  segment_text: string;
  mentioned_name?: string;
  observation_type?: string;
}

interface RosterLearner {
  learner_id: string;
  display_name: string;
  class_id: string;
}

export interface DraftRow {
  draft_id: string;
  segment_text: string;
  mentioned_name: string | null;
  observation_type: string;
  candidate_learner_ids: string[];
  status: "needs_learner" | "ready" | "confirmed" | "discarded";
  is_demo: boolean;
  confirmed_learner_id: string | null;
  created_at: Date;
}

/** Lowercase letters only, split into words, so "Amina  Njeri." compares equal to "amina njeri". */
function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Whitespace/case-insensitive form used to prove a segment really appears in the transcript. */
function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Deterministic learner matching (the model never picks the learner).
 * A learner is a candidate only if every spoken name word equals one of their name words.
 * "Amina" therefore matches every Amina; the caller must treat more than one candidate
 * as ambiguous and never take the first.
 */
export function matchLearnerCandidates(
  mentionedName: string | undefined,
  roster: RosterLearner[],
): string[] {
  const spoken = nameTokens(mentionedName ?? "");
  if (spoken.length === 0) {
    return [];
  }
  return roster
    .filter((learner) => {
      const words = new Set(nameTokens(learner.display_name));
      return spoken.every((word) => words.has(word));
    })
    .map((learner) => learner.learner_id);
}

/**
 * Learners the teacher can legitimately report on: actively enrolled (on the call date)
 * in a class the teacher is currently timetabled to teach.
 */
export async function loadTeacherRoster(
  teacherId: string,
  schoolId: string,
  onDate: Date,
): Promise<RosterLearner[]> {
  const result = await pool.query<RosterLearner>(
    `SELECT DISTINCT l.learner_id, l.display_name, e.class_id
     FROM timetable_assignments ta
     JOIN learner_enrollments e
       ON e.class_id = ta.class_id
      AND e.school_id = ta.school_id
      AND e.academic_year = ta.academic_year
     JOIN learners l ON l.learner_id = e.learner_id
     WHERE ta.teacher_id = $1
       AND ta.school_id = $2
       AND ta.valid_from <= $3::date
       AND (ta.valid_to IS NULL OR ta.valid_to >= $3::date)
       AND e.enrolled_from <= $3::date
       AND (e.enrolled_to IS NULL OR e.enrolled_to >= $3::date)
     ORDER BY l.display_name, l.learner_id`,
    [teacherId, schoolId, onDate.toISOString().slice(0, 10)],
  );
  return result.rows;
}

/**
 * Save the model's segments as drafts (called by the MCP tool during processing).
 * Safeguards: the recording must be in 'processing' (so only the pipeline can write),
 * every segment must be quoted from the transcript (no invented facts), and inserts are
 * keyed by (recording, segment_index) so a retry cannot duplicate drafts.
 * Segments whose learner is unknown or ambiguous are kept as 'needs_learner', not dropped.
 */
export async function saveCallObservationDrafts(
  recordingId: string,
  segments: DraftSegmentInput[],
): Promise<{ saved: number; rejected: number }> {
  const recording = await pool.query<{
    call_id: string;
    transcript_text: string | null;
    processing_status: string;
    teacher_id: string | null;
    school_id: string | null;
    is_demo: boolean;
    first_event_at: Date;
  }>(
    `SELECT r.call_id, r.transcript_text, r.processing_status,
            c.teacher_id, t.school_id, c.is_demo, c.first_event_at
     FROM call_recordings r
     JOIN teacher_calls c ON c.call_id = r.call_id
     LEFT JOIN teachers t ON t.teacher_id = c.teacher_id
     WHERE r.recording_id = $1`,
    [recordingId],
  );
  const row = recording.rows[0];
  if (!row || row.processing_status !== "processing" || !row.transcript_text) {
    throw new DraftError("Recording is not awaiting draft processing", 409);
  }
  if (!row.teacher_id || !row.school_id) {
    throw new DraftError("Call is not linked to a teacher yet", 409);
  }

  const transcript = normalizeText(row.transcript_text);
  const roster = await loadTeacherRoster(row.teacher_id, row.school_id, row.first_event_at);
  let saved = 0;
  let rejected = 0;

  for (const [index, segment] of segments.entries()) {
    const text = segment.segment_text.trim();
    if (!text || !transcript.includes(normalizeText(text))) {
      rejected += 1;
      continue;
    }
    const candidates = matchLearnerCandidates(segment.mentioned_name, roster);
    const type = (OBSERVATION_TYPES as readonly string[]).includes(
      segment.observation_type ?? "",
    )
      ? (segment.observation_type as ObservationType)
      : "other";
    const inserted = await pool.query(
      `INSERT INTO observation_drafts
         (recording_id, call_id, teacher_id, school_id, segment_index, segment_text,
          mentioned_name, observation_type, candidate_learner_ids, status, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (recording_id, segment_index) DO NOTHING`,
      [
        recordingId,
        row.call_id,
        row.teacher_id,
        row.school_id,
        index,
        text,
        segment.mentioned_name?.trim().slice(0, 100) || null,
        type,
        candidates,
        candidates.length === 1 ? "ready" : "needs_learner",
        row.is_demo,
      ],
    );
    saved += inserted.rowCount ?? 0;
  }
  return { saved, rejected };
}

/**
 * Fallback when the agent cannot segment the transcript after all retries:
 * keep the whole transcript as one unassigned draft so nothing the teacher said is lost.
 */
export async function saveUnsegmentedFallbackDraft(recordingId: string): Promise<void> {
  await pool.query(
    `INSERT INTO observation_drafts
       (recording_id, call_id, teacher_id, school_id, segment_index, segment_text,
        observation_type, candidate_learner_ids, status, is_demo)
     SELECT r.recording_id, r.call_id, c.teacher_id, t.school_id, 0,
            LEFT(r.transcript_text, 20000), 'other', '{}', 'needs_learner', c.is_demo
     FROM call_recordings r
     JOIN teacher_calls c ON c.call_id = r.call_id
     JOIN teachers t ON t.teacher_id = c.teacher_id
     WHERE r.recording_id = $1 AND r.transcript_text IS NOT NULL
     ON CONFLICT (recording_id, segment_index) DO NOTHING`,
    [recordingId],
  );
}

/** Drafts awaiting (or past) teacher review for one teacher, newest first. */
export async function listDrafts(context: LogObservationContext): Promise<DraftRow[]> {
  const result = await pool.query<DraftRow>(
    `SELECT draft_id, segment_text, mentioned_name, observation_type,
            candidate_learner_ids, status, is_demo, confirmed_learner_id, created_at
     FROM observation_drafts
     WHERE teacher_id = $1 AND school_id = $2 AND status <> 'discarded'
     ORDER BY created_at DESC, segment_index
     LIMIT 100`,
    [context.teacher_id, context.school_id],
  );
  return result.rows;
}

/**
 * Teacher confirms a draft: this is the only path from draft to real observation.
 * The learner must be the single unambiguous candidate or an explicit teacher choice
 * from their own roster. The existing logObservation does the write; its submission_id
 * (derived from the draft id) makes repeated confirmations return the same observation.
 */
export async function confirmDraft(
  draftId: string,
  learnerId: string | undefined,
  context: LogObservationContext,
): Promise<{ observation_id: string; duplicate: boolean }> {
  const draft = await pool.query<{
    segment_text: string;
    observation_type: string;
    candidate_learner_ids: string[];
    status: DraftRow["status"];
    is_demo: boolean;
    recording_id: string;
    transcription_provider: string | null;
    first_event_at: Date;
    observation_id: string | null;
  }>(
    `SELECT d.segment_text, d.observation_type, d.candidate_learner_ids, d.status,
            d.is_demo, d.recording_id, r.transcription_provider,
            c.first_event_at, d.observation_id
     FROM observation_drafts d
     JOIN teacher_calls c ON c.call_id = d.call_id
     JOIN call_recordings r ON r.recording_id = d.recording_id
     WHERE d.draft_id = $1 AND d.teacher_id = $2 AND d.school_id = $3`,
    [draftId, context.teacher_id, context.school_id],
  );
  const row = draft.rows[0];
  if (!row) {
    throw new DraftError("Draft not found", 404);
  }
  if (row.status === "confirmed" && row.observation_id) {
    return { observation_id: row.observation_id, duplicate: true };
  }
  if (row.status === "discarded") {
    throw new DraftError("Draft was discarded", 409);
  }

  const chosen =
    learnerId?.trim() ||
    (row.candidate_learner_ids.length === 1 ? row.candidate_learner_ids[0] : undefined);
  if (!chosen) {
    throw new DraftError("Choose the learner this observation is about", 400);
  }
  const roster = await loadTeacherRoster(context.teacher_id, context.school_id, row.first_event_at);
  if (!roster.some((learner) => learner.learner_id === chosen)) {
    throw new DraftError("That learner is not in this teacher's classes", 403);
  }

  const { observation, duplicate } = await logObservation(
    {
      learner_id: chosen,
      observation_type: (OBSERVATION_TYPES as readonly string[]).includes(row.observation_type)
        ? (row.observation_type as ObservationType)
        : "other",
      content: row.segment_text,
      observed_at: row.first_event_at.toISOString(),
      capture_method: "basic_phone_callback",
      submission_id: `call-draft:${draftId}`,
      recording_reference: `call-recording:${row.recording_id}`,
      transcript_text: row.segment_text,
      transcription_provider: row.transcription_provider ?? undefined,
      activity_context: row.is_demo ? "Demo voice call" : undefined,
    },
    context,
  );

  await pool.query(
    `UPDATE observation_drafts
     SET status = 'confirmed', confirmed_learner_id = $2, observation_id = $3, updated_at = NOW()
     WHERE draft_id = $1 AND status IN ('needs_learner', 'ready', 'confirmed')`,
    [draftId, chosen, observation.observation_id],
  );
  return { observation_id: observation.observation_id, duplicate };
}

/** Teacher rejects a draft; it is kept (status only) so the trace from the call remains. */
export async function discardDraft(
  draftId: string,
  context: LogObservationContext,
): Promise<void> {
  await pool.query(
    `UPDATE observation_drafts
     SET status = 'discarded', updated_at = NOW()
     WHERE draft_id = $1 AND teacher_id = $2 AND school_id = $3
       AND status IN ('needs_learner', 'ready')`,
    [draftId, context.teacher_id, context.school_id],
  );
}
