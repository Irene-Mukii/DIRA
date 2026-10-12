-- Voice-call lifecycle: provider call -> recording -> transcript -> observation drafts.
-- Traceability chain:
--   teacher_follow_up_jobs -> teacher_calls -> call_recordings -> observation_drafts -> observations

BEGIN;

-- Real-teacher mode needs a verified contact and recorded consent. Both stay NULL
-- until an administrator sets them; real calls are blocked while either is NULL.
ALTER TABLE teachers
    ADD COLUMN IF NOT EXISTS phone_e164 TEXT
        CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
    ADD COLUMN IF NOT EXISTS voice_consent_at TIMESTAMPTZ;

-- One row per provider call. provider_session_id is the Africa's Talking sessionId.
-- A callback can arrive before the dispatcher links the job, so job/teacher are nullable.
CREATE TABLE IF NOT EXISTS teacher_calls (
    call_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follow_up_job_id UUID REFERENCES teacher_follow_up_jobs(follow_up_job_id),
    teacher_id TEXT REFERENCES teachers(teacher_id),
    provider_session_id TEXT UNIQUE,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'requested' CHECK (
        status IN ('requested', 'ringing', 'in_progress', 'completed', 'not_answered', 'failed')
    ),
    direction TEXT,
    duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    first_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_calls_job
    ON teacher_calls (follow_up_job_id) WHERE follow_up_job_id IS NOT NULL;

-- Append-only provider callbacks. event_key is a hash of the meaningful payload fields,
-- so a repeated delivery of the same callback is stored once.
CREATE TABLE IF NOT EXISTS call_events (
    call_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES teacher_calls(call_id),
    event_key TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL CHECK (source IN ('voice', 'events', 'recording')),
    is_active BOOLEAN,
    call_session_state TEXT,
    duration_seconds INTEGER,
    has_recording BOOLEAN NOT NULL DEFAULT FALSE,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per recording; also holds transcript and agent-processing state so each
-- stage can be retried independently without duplicating work.
CREATE TABLE IF NOT EXISTS call_recordings (
    recording_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES teacher_calls(call_id),
    recording_url TEXT NOT NULL,
    duration_seconds INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'downloading', 'transcribing', 'transcribed',
                   'failed_retryable', 'failed')
    ),
    attempts INTEGER NOT NULL DEFAULT 0,
    transcript_text TEXT,
    transcription_provider TEXT,
    processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (
        processing_status IN ('pending', 'processing', 'done', 'failed_retryable', 'failed')
    ),
    processing_attempts INTEGER NOT NULL DEFAULT 0,
    last_error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (call_id, recording_url)
);

-- Draft observations from a transcript. learner may be unknown: those rows are
-- 'needs_learner' and wait for the teacher to pick the learner.
CREATE TABLE IF NOT EXISTS observation_drafts (
    draft_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_id UUID NOT NULL REFERENCES call_recordings(recording_id),
    call_id UUID NOT NULL REFERENCES teacher_calls(call_id),
    teacher_id TEXT NOT NULL REFERENCES teachers(teacher_id),
    school_id TEXT NOT NULL REFERENCES schools(school_id),
    segment_index INTEGER NOT NULL,
    segment_text TEXT NOT NULL,
    mentioned_name TEXT,
    observation_type TEXT NOT NULL DEFAULT 'other',
    candidate_learner_ids TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL CHECK (
        status IN ('needs_learner', 'ready', 'confirmed', 'discarded')
    ),
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_learner_id TEXT REFERENCES learners(learner_id),
    observation_id TEXT REFERENCES observations(observation_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (recording_id, segment_index)
);

CREATE INDEX IF NOT EXISTS idx_observation_drafts_teacher_status
    ON observation_drafts (teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_call_recordings_work
    ON call_recordings (status, processing_status);

COMMIT;
