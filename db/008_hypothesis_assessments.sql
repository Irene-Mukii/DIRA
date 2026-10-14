CREATE TABLE IF NOT EXISTS hypothesis_assessments (
    assessment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id TEXT NOT NULL,
    learner_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    previous_assessment_id UUID,
    classification TEXT NOT NULL CHECK (
        classification IN (
            'SUPPORTS',
            'MIXED',
            'CONTRADICTS',
            'INSUFFICIENT_EVIDENCE'
        )
    ),
    rationale TEXT NOT NULL CHECK (length(trim(rationale)) > 0),
    uncertainty JSONB NOT NULL CHECK (jsonb_typeof(uncertainty) = 'array'),
    limitations JSONB NOT NULL CHECK (jsonb_typeof(limitations) = 'array'),
    next_information_needed JSONB NOT NULL CHECK (
        jsonb_typeof(next_information_needed) = 'array'
    ),
    evidence_references JSONB NOT NULL CHECK (
        jsonb_typeof(evidence_references) = 'array'
    ),
    research_references JSONB NOT NULL CHECK (
        jsonb_typeof(research_references) = 'array'
    ),
    research_retrieval_status TEXT NOT NULL CHECK (
        research_retrieval_status IN (
            'success',
            'partial',
            'no_relevant_results',
            'failed'
        )
    ),
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    assessment_trigger TEXT NOT NULL CHECK (
        assessment_trigger IN ('initial', 'reassessment')
    ),
    change_explanation TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('CURRENT', 'SUPERSEDED')),
    UNIQUE (assessment_id, test_id),
    UNIQUE (test_id, version),
    FOREIGN KEY (test_id, learner_id)
        REFERENCES activity_tests(test_id, learner_id),
    FOREIGN KEY (previous_assessment_id, test_id)
        REFERENCES hypothesis_assessments(assessment_id, test_id),
    CHECK (
        (version = 1 AND previous_assessment_id IS NULL AND assessment_trigger = 'initial')
        OR
        (version > 1 AND previous_assessment_id IS NOT NULL AND assessment_trigger = 'reassessment')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hypothesis_assessments_current
    ON hypothesis_assessments (test_id)
    WHERE status = 'CURRENT';

CREATE INDEX IF NOT EXISTS idx_hypothesis_assessments_learner_test
    ON hypothesis_assessments (learner_id, test_id, version DESC);
