-- Phase 2 follow-up queue structures.
-- Safe to apply to an existing development database; no existing rows are removed.

ALTER TABLE schools
    ADD COLUMN IF NOT EXISTS timezone TEXT;

ALTER TABLE school_calendar
    ADD COLUMN IF NOT EXISTS event_status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (event_status IN ('scheduled', 'cancelled'));

CREATE TABLE IF NOT EXISTS school_closure_coverage (
    coverage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES schools(school_id),
    coverage_start DATE NOT NULL,
    coverage_end DATE NOT NULL,
    confirmed_at TIMESTAMPTZ NOT NULL,
    UNIQUE (school_id, coverage_start, coverage_end),
    CHECK (coverage_end >= coverage_start)
);

CREATE TABLE IF NOT EXISTS school_closures (
    school_id TEXT NOT NULL REFERENCES schools(school_id),
    closure_date DATE NOT NULL,
    closure_name TEXT NOT NULL CHECK (length(trim(closure_name)) > 0),
    PRIMARY KEY (school_id, closure_date)
);

CREATE TABLE IF NOT EXISTS teacher_follow_up_jobs (
    follow_up_job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_entry_id TEXT NOT NULL UNIQUE
        REFERENCES school_calendar(calendar_entry_id),
    school_id TEXT NOT NULL REFERENCES schools(school_id),
    class_id TEXT NOT NULL REFERENCES classes(class_id),
    teacher_id TEXT NOT NULL REFERENCES teachers(teacher_id),
    scheduled_date DATE NOT NULL,
    scheduled_end_at TIMESTAMPTZ NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (
        status IN ('queued', 'cancelled')
    ),
    cancel_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teacher_follow_up_jobs_due
    ON teacher_follow_up_jobs (status, scheduled_end_at);
CREATE INDEX IF NOT EXISTS idx_teacher_follow_up_jobs_teacher
    ON teacher_follow_up_jobs (teacher_id, scheduled_date);
