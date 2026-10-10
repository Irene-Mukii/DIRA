-- Phase 3 call-request lifecycle. Applying it does not initiate any calls.

ALTER TABLE teacher_follow_up_jobs
    DROP CONSTRAINT IF EXISTS teacher_follow_up_jobs_status_check;

ALTER TABLE teacher_follow_up_jobs
    ADD CONSTRAINT teacher_follow_up_jobs_status_check CHECK (
        status IN (
            'queued',
            'initiating',
            'provider_accepted',
            'provider_rejected',
            'outcome_unknown',
            'cancelled'
        )
    );

ALTER TABLE teacher_follow_up_jobs
    ADD COLUMN IF NOT EXISTS provider_request_id UUID,
    ADD COLUMN IF NOT EXISTS provider_http_status INTEGER,
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0
        CHECK (attempt_count >= 0),
    ADD COLUMN IF NOT EXISTS attempt_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS provider_accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_error_code TEXT;

CREATE INDEX IF NOT EXISTS idx_teacher_follow_up_jobs_initiating
    ON teacher_follow_up_jobs (status, attempt_started_at)
    WHERE status = 'initiating';
