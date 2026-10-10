-- PostgreSQL schema for the generated Dira CSV datasets.
-- Keep source IDs as TEXT. During import, convert blank optional CSV values to NULL.
-- Split activity_tests.trigger_observation_ids and teacher_reviews.evidence_ids
-- into the relationship tables below rather than storing comma-separated IDs.

CREATE TABLE teachers (
    teacher_id TEXT PRIMARY KEY
);

CREATE TABLE learners (
    learner_id TEXT PRIMARY KEY,
    grade_level TEXT NOT NULL,
    academic_year INTEGER NOT NULL,
    enrolment_status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE school_calendar (
    calendar_entry_id TEXT PRIMARY KEY,
    calendar_date DATE NOT NULL,
    academic_year INTEGER NOT NULL,
    term TEXT NOT NULL,
    year_group TEXT NOT NULL,
    weekday TEXT NOT NULL,
    period_number SMALLINT NOT NULL CHECK (period_number > 0),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    subject TEXT NOT NULL,
    planned_activity TEXT,
    event_name TEXT,
    event_type TEXT,
    UNIQUE (calendar_date, year_group, period_number),
    UNIQUE (calendar_entry_id, calendar_date),
    CHECK (end_time > start_time)
);

CREATE TABLE observations (
    observation_id TEXT PRIMARY KEY,
    learner_id TEXT NOT NULL REFERENCES learners(learner_id),
    observation_date DATE NOT NULL,
    term TEXT NOT NULL,
    calendar_entry_id TEXT NOT NULL,
    teacher_id TEXT NOT NULL REFERENCES teachers(teacher_id),
    activity_context TEXT,
    original_observation TEXT NOT NULL
        CHECK (length(trim(original_observation)) > 0),
    source_type TEXT NOT NULL,
    possible_theme TEXT NOT NULL,
    verification_status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (observation_id, learner_id),
    FOREIGN KEY (calendar_entry_id, observation_date)
        REFERENCES school_calendar(calendar_entry_id, calendar_date),
    CHECK (source_type IN (
        'Voice transcription', 'Text note', 'Phone callback', 'Teacher chat'
    )),
    CHECK (verification_status IN (
        'Pending', 'Needs more evidence', 'Repeated pattern',
        'Verified by multiple teachers', 'Inconclusive'
    ))
);

CREATE INDEX idx_observations_learner_date
    ON observations (learner_id, observation_date DESC);

CREATE TABLE activity_tests (
    test_id TEXT PRIMARY KEY,
    learner_id TEXT NOT NULL REFERENCES learners(learner_id),
    suggested_activity TEXT NOT NULL,
    activity_date DATE NOT NULL,
    conducting_teacher_id TEXT NOT NULL REFERENCES teachers(teacher_id),
    observed_outcome TEXT,
    outcome_observation_id TEXT,
    status TEXT NOT NULL,
    UNIQUE (test_id, learner_id),
    FOREIGN KEY (outcome_observation_id, learner_id)
        REFERENCES observations(observation_id, learner_id),
    CHECK (status IN ('Completed', 'In progress', 'Pending'))
);

CREATE TABLE activity_test_observations (
    test_id TEXT NOT NULL,
    learner_id TEXT NOT NULL,
    observation_id TEXT NOT NULL,
    PRIMARY KEY (test_id, observation_id),
    FOREIGN KEY (test_id, learner_id)
        REFERENCES activity_tests(test_id, learner_id),
    FOREIGN KEY (observation_id, learner_id)
        REFERENCES observations(observation_id, learner_id)
);

CREATE TABLE teacher_reviews (
    note_id TEXT PRIMARY KEY,
    learner_id TEXT NOT NULL REFERENCES learners(learner_id),
    draft_text TEXT NOT NULL,
    reviewer_id TEXT NOT NULL REFERENCES teachers(teacher_id),
    review_status TEXT NOT NULL,
    reviewed_at DATE,
    review_comments TEXT,
    UNIQUE (note_id, learner_id),
    CHECK (review_status IN ('Approved', 'Drafted', 'Needs revision'))
);

CREATE TABLE teacher_review_observations (
    note_id TEXT NOT NULL,
    learner_id TEXT NOT NULL,
    observation_id TEXT NOT NULL,
    PRIMARY KEY (note_id, observation_id),
    FOREIGN KEY (note_id, learner_id)
        REFERENCES teacher_reviews(note_id, learner_id),
    FOREIGN KEY (observation_id, learner_id)
        REFERENCES observations(observation_id, learner_id)
);

CREATE TABLE teacher_review_tests (
    note_id TEXT NOT NULL,
    learner_id TEXT NOT NULL,
    test_id TEXT NOT NULL,
    PRIMARY KEY (note_id, test_id),
    FOREIGN KEY (note_id, learner_id)
        REFERENCES teacher_reviews(note_id, learner_id),
    FOREIGN KEY (test_id, learner_id)
        REFERENCES activity_tests(test_id, learner_id)
);