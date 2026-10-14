ALTER TABLE agent_activity_logs
    ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'tool_event',
    ADD COLUMN IF NOT EXISTS workflow TEXT,
    ADD COLUMN IF NOT EXISTS attempt INTEGER CHECK (attempt IS NULL OR attempt > 0),
    ADD COLUMN IF NOT EXISTS provider TEXT,
    ADD COLUMN IF NOT EXISTS model TEXT,
    ADD COLUMN IF NOT EXISTS input_tokens BIGINT CHECK (
        input_tokens IS NULL OR input_tokens >= 0
    ),
    ADD COLUMN IF NOT EXISTS output_tokens BIGINT CHECK (
        output_tokens IS NULL OR output_tokens >= 0
    ),
    ADD COLUMN IF NOT EXISTS cached_tokens BIGINT CHECK (
        cached_tokens IS NULL OR cached_tokens >= 0
    ),
    ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(20, 8) CHECK (
        cost_usd IS NULL OR cost_usd >= 0
    ),
    ADD COLUMN IF NOT EXISTS cost_status TEXT CHECK (
        cost_status IS NULL OR cost_status IN ('calculated', 'unknown', 'not_applicable')
    ),
    ADD COLUMN IF NOT EXISTS metadata JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'agent_activity_logs_cached_tokens_check'
          AND conrelid = 'agent_activity_logs'::regclass
    ) THEN
        ALTER TABLE agent_activity_logs
            ADD CONSTRAINT agent_activity_logs_cached_tokens_check CHECK (
                cached_tokens IS NULL OR input_tokens IS NULL OR cached_tokens <= input_tokens
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'agent_activity_logs_cost_status_check'
          AND conrelid = 'agent_activity_logs'::regclass
    ) THEN
        ALTER TABLE agent_activity_logs
            ADD CONSTRAINT agent_activity_logs_cost_status_check CHECK (
                cost_status IS NULL
                OR (cost_status = 'calculated' AND cost_usd IS NOT NULL)
                OR (cost_status IN ('unknown', 'not_applicable') AND cost_usd IS NULL)
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_logs_event_timestamp
    ON agent_activity_logs (event_type, timestamp DESC);

CREATE TABLE IF NOT EXISTS education_markdown_cache (
    source_key TEXT NOT NULL CHECK (source_key IN ('IB', 'EEF', 'AMI', 'WWC')),
    canonical_url TEXT NOT NULL CHECK (
        canonical_url LIKE 'https://%'
        AND length(canonical_url) <= 2048
    ),
    title TEXT,
    markdown TEXT,
    content_sha256 CHAR(64) NOT NULL CHECK (
        content_sha256 ~ '^[0-9a-f]{64}$'
    ),
    content_bytes INTEGER NOT NULL CHECK (
        content_bytes > 0 AND content_bytes <= 128000
    ),
    format_version SMALLINT NOT NULL DEFAULT 1 CHECK (format_version > 0),
    last_successful_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (source_key, canonical_url, format_version)
);

CREATE INDEX IF NOT EXISTS idx_education_markdown_cache_fresh
    ON education_markdown_cache (last_successful_at)
    WHERE markdown IS NOT NULL;
