CREATE TABLE IF NOT EXISTS agent_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    agent_action TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    tool_input JSONB,
    tool_output JSONB,
    status TEXT NOT NULL CHECK (
        status IN ('started', 'success', 'error')
    ),
    duration_ms INTEGER CHECK (
        duration_ms IS NULL OR duration_ms >= 0
    ),
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_logs_run_id
    ON agent_activity_logs (run_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_agent_logs_tool_timestamp
    ON agent_activity_logs (tool_name, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_agent_logs_status
    ON agent_activity_logs (status, timestamp DESC);
