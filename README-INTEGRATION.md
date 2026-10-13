# DIRA agent activity UI + linked-test MCP test integration

This patch adds:
- A teacher-layout Agent Logs screen at `/agent-logs`.
- A same-origin API at `/api/agent-activity-logs` so the browser never receives `FOLLOW_UP_SCHEDULER_SECRET`.
- Status, tool-name, and run-ID filters, plus refresh, duration, and error display.
- A repeatable MCP test client that dynamically selects an eligible `ACCEPTED` linked test for the same trusted teacher context used by the MCP server.
- Compose initialization for the `agent_activity_logs` table.

## Apply

Extract this patch archive into the root of the repository (`DIRA/`), preserving the directory structure. Review the resulting diff before committing.

## Database migration

The new Compose mount initializes the table only when PostgreSQL creates a fresh data directory. If your existing `dira-postgres-data` volume is already initialized, apply the migration once:

```bash
PGPASSWORD=dira_local_dev_only psql -h localhost -p 5433 -U dira_dev -d dira_dev -f db/002_agent_activity_logs.sql
```

Use your own local development credentials if they differ. Do not commit `.env.local`.

## Verify

```bash
npx tsc --noEmit
DATABASE_URL='postgresql://dira_dev:dira_local_dev_only@localhost:5433/dira_dev' npm run mcp:test
npm run dev
```

Open `http://localhost:3000/agent-logs`.

The UI/API are intended for development/demo use only because the current app does not expose a verified administrator-role authorization mechanism. The API relies on the existing `resolveTeacherContext()` gate, which returns no context in production unless `DIRA_DEMO_MODE=true`. Before production exposure, implement authenticated administrator authorization and scope the logs according to that authorization.
