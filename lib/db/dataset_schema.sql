-- Canonical DIRA MVP schema for synthetic and application data.
-- This file is mounted as the Docker PostgreSQL initialization script and is
-- intended for a fresh development database. It is not an upgrade migration.

CREATE TABLE schools (
    school_id TEXT PRIMARY KEY,
    school_name TEXT NOT NULL,
    timezone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE teachers (
    teacher_id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES schools(school_id),
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (teacher_id, school_id)
);

CREATE TABLE classes (
    class_id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES schools(school_id),
    grade_level TEXT NOT NULL,
    stream_label TEXT NOT NULL,
    academic_year INTEGER NOT NULL,
    UNIQUE (school_id, grade_level, stream_label, academic_year),
    UNIQUE (class_id, school_id, academic_year)
);

CREATE TABLE learners (
    learner_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE learner_enrollments (
    learner_id TEXT NOT NULL REFERENCES learners(learner_id),
    class_id TEXT NOT NULL,
    school_id TEXT NOT NULL,
    academic_year INTEGER NOT NULL,
    enrolment_status TEXT NOT NULL CHECK (
        enrolment_status IN ('Active', 'At risk', 'Transitioning', 'Withdrawn')
    ),
    enrolled_from DATE NOT NULL,
    enrolled_to DATE,
    PRIMARY KEY (learner_id, academic_year),
    UNIQUE (learner_id, class_id, academic_year),
    FOREIGN KEY (class_id, school_id, academic_year)
        REFERENCES classes(class_id, school_id, academic_year),
    CHECK (enrolled_to IS NULL OR enrolled_to >= enrolled_from)
);

CREATE INDEX idx_learner_enrollments_class
    ON learner_enrollments (class_id, academic_year);

CREATE TABLE timetable_assignments (
    timetable_assignment_id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    teacher_id TEXT NOT NULL,
    academic_year INTEGER NOT NULL,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 5),
    period_number SMALLINT NOT NULL CHECK (period_number > 0),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    subject TEXT NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE,
    UNIQUE (class_id, academic_year, weekday, period_number, valid_from),
    FOREIGN KEY (class_id, school_id, academic_year)
        REFERENCES classes(class_id, school_id, academic_year),
    FOREIGN KEY (teacher_id, school_id)
        REFERENCES teachers(teacher_id, school_id),
    CHECK (end_time > start_time),
    CHECK (valid_to IS NULL OR valid_to >= valid_from),
    UNIQUE (
        timetable_assignment_id,
        school_id,
        class_id,
        teacher_id,
        academic_year
    )
);

CREATE INDEX idx_timetable_assignments_teacher
    ON timetable_assignments (teacher_id, academic_year, weekday, period_number);

CREATE TABLE school_calendar (
    calendar_entry_id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    teacher_id TEXT NOT NULL,
    timetable_assignment_id TEXT NOT NULL
        REFERENCES timetable_assignments(timetable_assignment_id),
    calendar_date DATE NOT NULL,
    academic_year INTEGER NOT NULL,
    term TEXT NOT NULL,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 5),
    period_number SMALLINT NOT NULL CHECK (period_number > 0),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    subject TEXT NOT NULL,
    planned_activity TEXT,
    event_name TEXT,
    event_type TEXT,
    event_status TEXT NOT NULL DEFAULT 'scheduled' CHECK (
        event_status IN ('scheduled', 'cancelled')
    ),
    UNIQUE (calendar_date, class_id, period_number),
    UNIQUE (calendar_entry_id, calendar_date, class_id, academic_year),
    FOREIGN KEY (class_id, school_id, academic_year)
        REFERENCES classes(class_id, school_id, academic_year),
    FOREIGN KEY (teacher_id, school_id)
        REFERENCES teachers(teacher_id, school_id),
    FOREIGN KEY (
        timetable_assignment_id,
        school_id,
        class_id,
        teacher_id,
        academic_year
    )
        REFERENCES timetable_assignments(
            timetable_assignment_id,
            school_id,
            class_id,
            teacher_id,
            academic_year
        ),
    CHECK (end_time > start_time)
);

CREATE INDEX idx_school_calendar_teacher_period
    ON school_calendar (teacher_id, calendar_date, period_number);
CREATE INDEX idx_school_calendar_class_date
    ON school_calendar (class_id, calendar_date, period_number);

CREATE TABLE school_closure_coverage (
    coverage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id TEXT NOT NULL REFERENCES schools(school_id),
    coverage_start DATE NOT NULL,
    coverage_end DATE NOT NULL,
    confirmed_at TIMESTAMPTZ NOT NULL,
    UNIQUE (school_id, coverage_start, coverage_end),
    CHECK (coverage_end >= coverage_start)
);

CREATE TABLE school_closures (
    school_id TEXT NOT NULL REFERENCES schools(school_id),
    closure_date DATE NOT NULL,
    closure_name TEXT NOT NULL CHECK (length(trim(closure_name)) > 0),
    PRIMARY KEY (school_id, closure_date)
);

CREATE TABLE teacher_follow_up_jobs (
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
        status IN (
            'queued',
            'initiating',
            'provider_accepted',
            'provider_rejected',
            'outcome_unknown',
            'cancelled'
        )
    ),
    cancel_reason TEXT,
    provider_request_id UUID,
    provider_http_status INTEGER,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    attempt_started_at TIMESTAMPTZ,
    provider_accepted_at TIMESTAMPTZ,
    last_error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teacher_follow_up_jobs_due
    ON teacher_follow_up_jobs (status, scheduled_end_at);
CREATE INDEX idx_teacher_follow_up_jobs_teacher
    ON teacher_follow_up_jobs (teacher_id, scheduled_date);

CREATE TABLE observations (
    observation_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    learner_id TEXT NOT NULL,
    teacher_id TEXT NOT NULL,
    school_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    academic_year INTEGER NOT NULL,
    observation_date DATE NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    term TEXT,
    calendar_entry_id TEXT,
    observation_type TEXT NOT NULL CHECK (
        observation_type IN (
            'participation',
            'academic',
            'behavioral',
            'attendance',
            'extracurricular',
            'test_result',
            'other'
        )
    ),
    original_observation TEXT NOT NULL
        CHECK (length(trim(original_observation)) > 0),
    subject TEXT,
    activity_context TEXT,
    source_type TEXT NOT NULL DEFAULT 'Text note' CHECK (
        source_type IN ('Voice transcription', 'Text note', 'Phone callback', 'Teacher chat')
    ),
    capture_method TEXT NOT NULL DEFAULT 'text' CHECK (
        capture_method IN ('text', 'in_app_voice', 'basic_phone_callback', 'other')
    ),
    possible_theme TEXT,
    verification_status TEXT NOT NULL DEFAULT 'Pending' CHECK (
        verification_status IN (
            'Pending',
            'Needs more evidence',
            'Repeated pattern',
            'Verified by multiple teachers',
            'Inconclusive'
        )
    ),
    submission_id TEXT NOT NULL UNIQUE,
    linked_test_id TEXT,
    recording_reference TEXT,
    transcript_text TEXT,
    transcription_provider TEXT,
    transcription_status TEXT,
    teacher_review_status TEXT NOT NULL DEFAULT 'not_required' CHECK (
        teacher_review_status IN ('not_required', 'recorded', 'confirmed', 'updated')
    ),
    reviewed_observation TEXT,
    reviewed_by_teacher_id TEXT REFERENCES teachers(teacher_id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (observation_id, learner_id),
    FOREIGN KEY (learner_id, class_id, academic_year)
        REFERENCES learner_enrollments(learner_id, class_id, academic_year),
    FOREIGN KEY (teacher_id, school_id)
        REFERENCES teachers(teacher_id, school_id),
    FOREIGN KEY (calendar_entry_id, observation_date, class_id, academic_year)
        REFERENCES school_calendar(calendar_entry_id, calendar_date, class_id, academic_year)
);

CREATE INDEX idx_observations_learner_date
    ON observations (learner_id, observed_at DESC);
CREATE INDEX idx_observations_class_date
    ON observations (class_id, observation_date DESC);
CREATE INDEX idx_observations_teacher_review
    ON observations (teacher_id, teacher_review_status, created_at DESC)
    WHERE teacher_review_status = 'recorded';

CREATE TABLE observation_review_history (
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id TEXT NOT NULL UNIQUE,
    observation_id TEXT NOT NULL REFERENCES observations(observation_id) ON DELETE CASCADE,
    reviewer_id TEXT NOT NULL REFERENCES teachers(teacher_id),
    review_status TEXT NOT NULL CHECK (review_status IN ('confirmed', 'updated')),
    previous_text TEXT NOT NULL,
    updated_text TEXT,
    previous_observation_type TEXT,
    updated_observation_type TEXT,
    previous_linked_test_id TEXT,
    updated_linked_test_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (review_status = 'confirmed' AND updated_text IS NULL)
        OR (review_status = 'updated' AND updated_text IS NOT NULL)
    )
);

CREATE TABLE attendance (
    attendance_id TEXT PRIMARY KEY,
    learner_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    academic_year INTEGER NOT NULL,
    calendar_entry_id TEXT NOT NULL,
    calendar_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('present', 'late', 'absent', 'excused', 'unknown')
    ),
    recorded_at TIMESTAMPTZ NOT NULL,
    recorded_by_teacher_id TEXT,
    source TEXT NOT NULL DEFAULT 'teacher_register',
    note TEXT,
    UNIQUE (learner_id, calendar_entry_id),
    FOREIGN KEY (learner_id, class_id, academic_year)
        REFERENCES learner_enrollments(learner_id, class_id, academic_year),
    FOREIGN KEY (calendar_entry_id, calendar_date, class_id, academic_year)
        REFERENCES school_calendar(calendar_entry_id, calendar_date, class_id, academic_year),
    FOREIGN KEY (recorded_by_teacher_id)
        REFERENCES teachers(teacher_id)
);

CREATE INDEX idx_attendance_learner_status
    ON attendance (learner_id, status, recorded_at DESC);
CREATE INDEX idx_attendance_session
    ON attendance (calendar_entry_id, status);

CREATE TABLE activity_tests (
    test_id TEXT PRIMARY KEY,
    learner_id TEXT NOT NULL REFERENCES learners(learner_id),
    suggested_activity TEXT NOT NULL,
    activity_date DATE NOT NULL,
    conducting_teacher_id TEXT NOT NULL REFERENCES teachers(teacher_id),
    observed_outcome TEXT,
    outcome_observation_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('Completed', 'In progress', 'Pending')),
    UNIQUE (test_id, learner_id),
    FOREIGN KEY (outcome_observation_id, learner_id)
        REFERENCES observations(observation_id, learner_id)
        DEFERRABLE INITIALLY DEFERRED,
    CHECK (status <> 'Completed' OR outcome_observation_id IS NOT NULL)
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

ALTER TABLE observations
    ADD CONSTRAINT observations_linked_test_same_learner_fk
    FOREIGN KEY (linked_test_id, learner_id)
        REFERENCES activity_tests(test_id, learner_id)
        DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE teacher_reviews (
    note_id TEXT PRIMARY KEY,
    learner_id TEXT NOT NULL REFERENCES learners(learner_id),
    draft_text TEXT NOT NULL,
    reviewer_id TEXT NOT NULL REFERENCES teachers(teacher_id),
    review_status TEXT NOT NULL
        CHECK (review_status IN ('Approved', 'Drafted', 'Needs revision')),
    reviewed_at DATE,
    review_comments TEXT,
    UNIQUE (note_id, learner_id)
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
