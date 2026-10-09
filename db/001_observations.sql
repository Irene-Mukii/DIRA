
CREATE TABLE IF NOT EXISTS learners (
    learner_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    class_label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS observations (
    observation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    learner_id TEXT NOT NULL
        REFERENCES learners(learner_id),

    observer_id TEXT NOT NULL,
    observer_role TEXT,

    observation_type TEXT NOT NULL
        CHECK (observation_type IN (
            'participation',
            'academic',
            'behavioral',
            'attendance',
            'extracurricular',
            'test_result',
            'other'
        )),

    content_original TEXT NOT NULL
        CHECK (length(trim(content_original)) > 0),

    subject TEXT,
    term TEXT,
    observed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    capture_method TEXT NOT NULL DEFAULT 'text'
        CHECK (capture_method IN (
            'text',
            'in_app_voice',
            'basic_phone_callback',
            'other'
        )),

    submission_id TEXT NOT NULL UNIQUE,
    linked_test_id TEXT,

    recording_reference TEXT,
    transcript_text TEXT,
    transcription_provider TEXT,
    transcription_status TEXT,
    created_by_request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_observations_learner_observed
    ON observations (learner_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_observations_learner_created
    ON observations (learner_id, created_at DESC);

