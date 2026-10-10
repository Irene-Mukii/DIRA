# Learner Profile MCP
# Teacher-focused classroom observation and learning pathway system

## Local development database

The development setup uses a disposable PostgreSQL 16 container. The compose
service binds only to `127.0.0.1`; its credentials are public development-only
defaults and must never be reused outside local development.

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

`DIRA_DEMO_TEACHER_ID` and `DIRA_DEMO_SCHOOL_ID` enable the temporary local
demo context. The application currently has no authenticated teacher session;
the API intentionally refuses observation reads and writes in production
instead of trusting a teacher ID sent by the browser.

Voice transcription, calendar integration, and real outbound calling are not
connected by this development database setup.