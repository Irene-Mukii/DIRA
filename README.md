# Learner Profile MCP
# Teacher-focused classroom observation and learning pathway system

## Local development database

The development setup uses a disposable PostgreSQL 16 container. The compose
service binds only to `127.0.0.1`; its credentials are public development-only
defaults and must never be reused outside local development. The host port is
`5433` to avoid clashes with local PostgreSQL installations; the container still
listens on PostgreSQL's standard port `5432`.

### Start the database

In PowerShell:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
docker compose up -d --wait postgres
```

On its first start, Docker applies `lib/db/dataset_schema.sql` to a new data
volume. PostgreSQL does not rerun initialization scripts when that volume
already contains a database. Schema edits therefore need a deliberate
development-database migration or a fresh disposable volume; never remove a
volume until its data has been checked and is safe to lose.

### Generate, validate, and import synthetic records

```powershell
py -3 scripts/generate_synthetic_data.py --include-teacher-reviews
py -3 scripts/clean_dataset.py
npm run db:seed:dev
```

Generation writes only to `data/generated_dev/`. Cleaning checks the IDs,
relationships, timetable assignments, attendance, and evidence references
before writing `data/cleaned/generated_dev/`. Both development-output folders
are ignored by Git. The importer reads `.env.local` (or `.env`) when
`DATABASE_URL` is not already present in its process environment.

The default synthetic dataset includes two clearly labeled participation
observations for L003 in the latest school year, on separate T001 class dates.
They provide a repeatable example for trying the suggested-test workflow at
`/evidence/L003`; they are synthetic demo records, not real learner evidence.

### Run the Suggest Test browser end-to-end demo

Install the Chromium browser once, then run:

```powershell
npx playwright install chromium
```

In one terminal, start the app:

```powershell
npm run dev
```

In another terminal, run the browser test:

```powershell
npm run test:e2e:suggest-test
```

The browser test uses the local Next.js server at `http://localhost:3000`,
opens the
synthetic learner L003's Evidence Card, requests a GLM-generated proposal,
rejects it for regeneration, checks the linked proposals after reload, and
removes only the rows created by that test. It refuses to run unless the
database URL points to the local `dira_dev` database on port `5433` as
`dira_dev`. The failure-state test stubs the browser's API response to check
safe UI handling; it does not simulate a live provider outage. The graph's
separate unit test verifies that a GLM outage propagates without saving a
fallback. Watch the Next.js server output during the demo to inspect the
correlated LangGraph stage and MCP-tool logs. Live GLM and educational-source
availability still depend on the local credentials and network.

The importer requires `--confirm-development` (included in the npm script) and
rejects non-loopback databases, non-development usernames, and databases other
than `dira_dev`. It performs transactional upserts and does not truncate or
delete existing rows. Reimporting the same generated dataset is safe; if a
smaller dataset is generated later, rows no longer present in its CSVs remain
in the database until deliberately reviewed and removed.

To validate the CSVs and local-target guard without connecting to PostgreSQL,
run `npm run db:seed:dev -- --check-only`.

### Run the application

```powershell
npm run dev
```

### Run follow-up queue and dispatch integration checks

```powershell
npm run test:follow-ups
```

These tests use the local Docker development database only (`dira_dev`, user
`dira_dev`, port `5433`). Set `DIRA_TEST_DATABASE_URL` in `.env.local` to that
development database URL before running them; the test runner refuses any other
database target and never falls back to the application's `DATABASE_URL`. They
create uniquely named temporary schedule rows and remove them afterward. The test
dispatch mocks Africa's Talking, so it cannot place a real call. Run them
separately from `npm run build`; a test failure does not change or block the
production build.

In development, Dira uses the oldest recorded teacher (ties are resolved by
teacher ID) as a single demo identity. It does not trust a teacher ID from a
browser or model. Set `DIRA_DEMO_MODE=true` only for an isolated demo database;
in production this explicitly enables the unauthenticated single-teacher demo
and is not suitable for real teacher or learner data. Production login and
multi-teacher authorization remain deferred.

The scheduled Dira agent uses the Z.AI GLM-5.3 API (`ZAI_API_KEY`) and connects
to Dira's own Streamable HTTP MCP endpoint using `DIRA_MCP_SERVER_URL` and
`DIRA_MCP_ACCESS_TOKEN`. Configure a long random server-side token; never expose
it to browser code. `FOLLOW_UP_SCHEDULER_SECRET` protects
`POST /api/internal/follow-up-agent`, whose JSON body selects either
`{"trigger":"prepare_queue"}` or `{"trigger":"dispatch_due"}`. Configure the
deployment scheduler to call queue preparation at 7:00 a.m. on eligible
weekdays and due dispatch at/after class end times. The repository exposes the
trigger endpoint but does not select or configure a hosting scheduler.

Voice transcription, calendar integration, and real outbound calling are not
connected by this development database setup.