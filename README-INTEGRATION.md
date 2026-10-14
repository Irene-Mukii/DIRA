# DIRA MCP, retrieval, and agent observability

This guide describes the implementation present in this repository. Dira's MCP
endpoint and teacher context are demo-only; do not use them with real learner
data or treat them as production authentication.

## Local prerequisites and database

Use Node.js supported by the project, Docker Compose, PostgreSQL 16 for local
development, and (only if Fetch MCP is enabled) `uvx`. Copy `.env.example` to
`.env.local`, fill in local credentials privately, and start PostgreSQL:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
docker compose up -d --wait postgres
npm install
npm run dev
```

For an existing development database, apply migrations in order. Migration 009
assumes the `agent_activity_logs` table from migration 002 already exists:

```powershell
psql -h localhost -p 5433 -U dira_dev -d dira_dev -W -f db\002_agent_activity_logs.sql
psql -h localhost -p 5433 -U dira_dev -d dira_dev -W -f db\009_agent_run_events_education_cache.sql
```

The commands prompt for the local database password. Verify the target before
applying migrations; do not run development migrations against production
without a reviewed backup and deployment plan. PostgreSQL's Compose
initialization scripts run only when its data volume is first created.

## Operator-controlled production demo voice

Production voice calls are disabled by default. A demo deployment can enable
them only when `DIRA_DEMO_MODE=true`, `DIRA_DEMO_CALL_TEST_MODE=true`,
`DIRA_ALLOW_PRODUCTION_DEMO_CALLS=true`, and `DIRA_DEMO_CALL_TO` is a valid
E.164 number. The dispatcher and provider client both enforce the configured
demo number; real-teacher calls are rejected when the app is in demo mode.

Configure the Africa's Talking voice credentials, `AFRICASTALKING_VOICE_FROM`,
`VOICE_CALLBACK_SECRET`, `DIRA_PUBLIC_BASE_URL`, and a long random
`FOLLOW_UP_SCHEDULER_SECRET` as server-only deployment secrets. Register the
HTTPS callback
`<DIRA_PUBLIC_BASE_URL>/api/voice/cb/<VOICE_CALLBACK_SECRET>/teacher-follow-up`
with Africa's Talking. Set `OPENAI_API_KEY` only if the demo will transcribe
recordings; call recordings sent for transcription are processed by OpenAI.

The public follow-up page does not dispatch production calls. An operator who
holds the scheduler secret can explicitly queue and dispatch one demo call per
request with `POST /api/internal/demo-voice` and an
`Authorization: Bearer <FOLLOW_UP_SCHEDULER_SECRET>` header. This places a
potentially chargeable call to the single configured demo number; repeat
requests can place additional calls. Keep the secret private and invoke the
endpoint only when the recipient has agreed to receive the test call. This is
a controlled demo safeguard, not production teacher authentication or consent
management. Use synthetic Dira data only.

For the public visitor “Test a call” dialog, additionally set
`DIRA_ALLOW_PUBLIC_DEMO_CALLS=true` and a random `DEMO_CALL_RATE_LIMIT_SECRET`
of at least 32 bytes. The API requires the caller to confirm consent, validates
E.164 phone numbers server-side, and enforces one request per number and ten
requests total per rolling 24 hours. It stores only a keyed phone-number hash
in `agent_activity_logs`; the phone is sent to Africa's Talking for delivery
but is not persisted by this feature. A callback recording is still attached
to the shared synthetic demo-teacher workflow and may be transcribed if
`OPENAI_API_KEY` is configured, so callers must not mention real learner names
or sensitive information. This is an abuse-limited public demo feature, not
number ownership verification or production authentication.

## Independent external MCP client

### Endpoint, transport, identity, and prerequisites

Dira exposes the Streamable HTTP MCP server at
`http://localhost:3000/api/mcp/server` for local development, or at the
equivalent HTTPS URL in a deployed environment. The route is implemented by
`app/api/mcp/server/route.ts`; connect using the official MCP SDK's
`StreamableHTTPClientTransport`. Configure:

- `DIRA_MCP_SERVER_URL`: complete MCP endpoint URL.
- `DIRA_MCP_ACCESS_TOKEN`: long random server-side bearer token. Send it as
  `Authorization: Bearer <token>`; never put it in browser code, source control,
  screenshots, or client-distributed configuration.
- `DATABASE_URL`: Dira's PostgreSQL connection for tools that read or write
  application data.
- `DIRA_DEMO_MODE=true`: local isolated demo context; do not enable this for
  real teacher or learner records.

The token authorizes access to the server, but does not identify an individual
MCP caller. Dira resolves a single demo teacher on the server; the client
cannot provide its own teacher identity, attach its own database, or obtain
per-person authorization. The caller does not need its own database. Dira's
database is required by application-data tools. `retrieve_education_resources`
accepts no learner ID and can use direct retrieval without a database when
Fetch MCP is disabled; enabling the persistent cache requires Dira's PostgreSQL
database and migration 009.

The repository exposes 13 Dira-owned tools in the verified local server.
Discovery is via MCP `tools/list`; invoke a discovered tool using `tools/call`.
The read-only education retrieval tool is the recommended independent smoke
test. Other tools, including `log_observation`, `suggest_test`,
`persist_test_suggestion`, and follow-up dispatch, may write application data
and must not be exposed to an untrusted client.

### Tool schema, response, and errors

`retrieve_education_resources` accepts:

```json
{ "query": "structured classroom discussion" }
```

Its structured result contains a top-level `status` (`success`, `partial`,
`no_relevant_results`, or `failed`) and a `sources` array with one outcome per
configured source. Successful sources include the exact page URL, title,
retrieval time, bounded excerpt, and duration; failures include a stable error
category and available HTTP status. A tool response can therefore be a
successful MCP invocation while all source outcomes are failed. HTTP 401 means
the bearer token is missing/invalid; HTTP 503 means MCP access is not
configured; unexpected server failures return HTTP 500 without stack traces.
Tool-level validation/business errors are returned as structured MCP errors.

Minimal independent-client example (keep the token in a server-side
environment variable):

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client(
  { name: "independent-dira-client", version: "1.0.0" },
  {
    capabilities: {},
  },
);
const transport = new StreamableHTTPClientTransport(
  new URL(process.env.DIRA_MCP_SERVER_URL!),
  {
    requestInit: {
      headers: {
        Authorization: `Bearer ${process.env.DIRA_MCP_ACCESS_TOKEN}`,
      },
    },
  },
);
await client.connect(transport);
const { tools } = await client.listTools();
if (!tools.some((tool) => tool.name === "retrieve_education_resources")) {
  throw new Error("Education retrieval is not advertised");
}
const result = await client.callTool({
  name: "retrieve_education_resources",
  arguments: { query: "structured classroom discussion" },
});
await client.close();
```

Run Dira locally and verify tool discovery plus a safe read-only invocation:

```powershell
npm run dev
npm run mcp:test:external
```

The test reads `.env.local`, rejects unsafe endpoint URLs, checks the advertised
tool schema and response shape, and reports per-source status. It does not
verify production caller identity or guarantee that a source is available.

## Fetch MCP and education retrieval

Fetch MCP is an optional retrieval provider behind Dira's existing
`retrieve_education_resources` service/tool. Dira still selects the configured
official IB, EEF, AMI, and WWC domains, discovers candidate pages, ranks
evidence, validates URLs and excerpts, and owns the public tool response.
Fetch MCP is not a separate learner-retrieval pipeline.

Set `FETCH_MCP_ENABLED=true` to enable it; it is disabled by default. Local
development uses stdio and starts the pinned official
`mcp-server-fetch==2026.10.10` with `uvx --from
mcp-server-fetch==2026.10.10 mcp-server-fetch`. `FETCH_MCP_COMMAND` can
override the executable and otherwise defaults to `uvx`. On Windows Dira sets
`PYTHONIOENCODING=utf-8`.

For Vercel, deploy the authenticated Docker gateway described in
[`fetch-mcp-server/README.md`](./fetch-mcp-server/README.md) as a Render Web
Service. The gateway runs the same pinned Fetch package locally and exposes
only the `fetch` tool over stateless HTTPS Streamable HTTP. Configure these
server-only Vercel variables in Preview first: `FETCH_MCP_ENABLED=true`,
`FETCH_MCP_TRANSPORT=http`, `FETCH_MCP_URL=https://<render-service>/mcp`, and
`FETCH_MCP_TOKEN` equal to Render's `FETCH_MCP_AUTH_TOKEN`. Configure
Production separately only after the real Preview integration test succeeds.
Never use `NEXT_PUBLIC_` for the token. Render's default HTTPS endpoint is
publicly reachable but requires the bearer token for MCP requests; its health
check reveals only readiness.

The local stdio process and Render's container need package access at startup
and outbound network access to the approved public sources. Fetch MCP introduces
runtime/service availability, package-index, and network dependencies; no
separate usage charge was identified for the selected package, but hosting,
network, and package execution still have infrastructure cost. A blocked page
may remain blocked, and the provider does not bypass access controls or
guarantee faster responses.

### Eligibility, validation, cache, and failure handling

- Retrieval begins only for the four configured source definitions; sitemap
  references and candidate pages are constrained to their approved HTTPS
  domains. Redirects are preflighted with a bounded redirect count before the
  vetted URL is sent to Fetch MCP. Dira retains its request timeouts and page,
  sitemap, and candidate limits.
- Cache identity is `(source_key, canonical_url, format_version)`. Migration
  `db/009_agent_run_events_education_cache.sql` creates
  `education_markdown_cache` and extends `agent_activity_logs`.
- The successful Markdown body is reusable for 14 days from
  `last_successful_at`. When Fetch MCP is enabled, before source discovery,
  Dira searches at most 12 fresh cached Markdown pages per source for query
  terms and returns the best relevant cached page without making source URL
  requests. If there is no relevant match, retrieval continues through the
  existing source discovery and exact-URL cache flow.
- A miss or stale entry attempts a fresh retrieval. Only non-empty Markdown
  that passes the 128,000-byte UTF-8 limit, SHA-256 validation, allowed-domain
  URL check, and expected URL check is saved. Failures never replace good
  content or extend its freshness.
- In the Node.js runtime, `instrumentation.ts` starts an immediate expiry pass
  and an unreferenced hourly cache-cleanup timer. Cleanup errors are reported
  to server logs; this timer is maintenance only and does not schedule agent
  follow-up work.
- Expired Markdown is not served as stale fallback. At the 14-day boundary the
  body is nulled while URL, source, hash, byte count, and last-success timestamp
  remain for metadata/audit purposes. A failed Fetch refresh can fall back to
  Dira's existing validated direct retrieval; this is a fresh direct attempt,
  not reuse of expired cache content.
- Cache hits/misses/refreshes, expiry, Fetch request outcomes, and errors are
  written to correlated agent activity events when PostgreSQL logging is
  available. Malformed, empty, oversized, denied, missing, and timed-out
  results remain explicit source failures; no failure is cached as fresh.

PostgreSQL `TEXT` supports far more than the configured 128,000-byte per-entry
limit (the practical row-size limit is well above this payload, with large
values stored using PostgreSQL TOAST). The implementation reads a body only
when the cache entry is fresh and needed for evidence; hash/size/freshness
metadata checks omit it. The local verification stored a 128,000-byte Markdown
value, checked the 14-day freshness boundary, and confirmed expiry retains
metadata while nulling the body. That verifies the chosen row-storage and
access pattern at the configured maximum, not large-scale load or production
table growth.

Run focused retrieval/cache tests:

```powershell
npm run test:suggest-test
```

The opt-in stdio/PostgreSQL integration test starts the real pinned Fetch MCP
process and requires the local `dira_dev` database. On Windows, set `FETCH_MCP_COMMAND` to
the absolute path of `uvx.exe` if it is not on `PATH`:

```powershell
$env:RUN_FETCH_MCP_INTEGRATION = "true"
$env:FETCH_MCP_ENABLED = "true"
$env:FETCH_MCP_COMMAND = "C:\path\to\uvx.exe"
npm run test:fetch-mcp
```

The test requires `DATABASE_URL` to point to loopback `dira_dev` as user
`dira_dev`; it refuses other databases and cleans its unique cache row. If
Fetch MCP is unavailable, the test is blocked rather than treated as a pass.

The real Render endpoint test is separate and does not require the database:

```powershell
$env:RUN_FETCH_MCP_REMOTE_INTEGRATION = "true"
$env:FETCH_MCP_ENABLED = "true"
$env:FETCH_MCP_TRANSPORT = "http"
$env:FETCH_MCP_URL = "https://<render-service>.onrender.com/mcp"
$env:FETCH_MCP_TOKEN = "<Preview token>"
npm run test:fetch-mcp
```

It discovers and invokes the real remote `fetch` tool and makes an outbound
request to WWC. It does not prove production readiness unless run against the
deployed Preview service with its real token; mocked gateway tests only verify
local protocol behavior.

### Why Fetch MCP, and what the evaluations showed

The existing direct retrieval already enforces source selection, bounded HTTP
requests, and plain-text extraction, but observed live failures include 403,
404, oversized responses, and extraction failures. Fetch MCP is considered for
its reusable Markdown extraction and standard independently discoverable MCP
interface, which makes the provider testable without creating another Dira
education pipeline. It does not solve all observed failure modes, and Dira
retains a direct fallback and all source restrictions. This is an
interoperability and extraction-maintenance rationale, not evidence that Fetch
MCP is faster or more reliable than Dira's direct baseline. Upstream source
restrictions and rate limits remain in force; Dira's bounded request policy is
not a provider quota or a guarantee of source availability.

In the recorded WWC comparison, direct retrieval returned relevant content in
about 1.25 seconds and Fetch MCP returned about 981 characters in about 3.16
seconds; the test setup used a synthetic sitemap. Fetch MCP was slower in that
sample, so latency improvement has not been demonstrated. The independent
MCP smoke invocation on 2026-10-14 discovered 13 tools and returned a valid
four-source response, but all live sources failed in that run: IB 403, EEF 404,
AMI oversized response, and WWC extraction failure. Protocol discovery and
invocation passed; successful live retrieval did not. See `EVALS.md` for
statuses and limitations.

## Scheduled agent, logs, and model cost

The protected `POST /api/internal/follow-up-agent` route is the trigger entry
point; `FOLLOW_UP_SCHEDULER_SECRET` is required by the internal route. Its body
selects `{"trigger":"prepare_queue"}` or `{"trigger":"dispatch_due"}`. The
repository does not install or configure a scheduler, so no automatic schedule
is currently active. An operator must choose and configure an external
scheduler, secure its secret, and verify retry and duplicate-trigger behavior
before claiming automatic operation. Existing queue preparation uses
database-level idempotency; the scheduled agent is bounded to four model turns
and eight tool calls, with per-tool limits for queue and dispatch operations.
The trigger starts one agent run per accepted request and returns when that run
finishes or fails; retries are the external scheduler's responsibility.
Database idempotency prevents duplicate queue entries, but does not substitute
for verifying the scheduler's full duplicate-trigger policy. Failure is
returned/logged rather than converted to a successful fallback.

Runs have a UUID `run_id`; the workflow and tool/cache/model events use that ID
to correlate execution. The `agent_activity_logs` table stores event type,
timestamps, status, tool, duration, safe error, model/token counts, cost
metadata, and structured non-sensitive metadata. Inspect records in PostgreSQL
by `run_id`; the UI is at `http://localhost:3000/agent-logs` and its same-origin
API is `/api/agent-activity-logs`. The UI presents at most 100 newest rows and
supports status/tool/run-ID filters. Both UI and API retain the demo teacher
context and are not production administrator authorization; add real
authenticated administrator authorization and data scoping before production.
If the page shows zero rows, first confirm migrations 002 and 009, the
`DATABASE_URL` used by the running server, and that an event was actually
persisted; an empty table is not evidence that the UI has been validated against
stored data.

Model usage is captured only when the provider response includes token counts.
Estimated cost currently covers GLM-5.3 Flash token charges only, using rates
from the configured Z.AI pricing source observed 2026-10-14: input
USD 0.15/million tokens, cached input USD 0.03/million, and output USD
0.50/million. The formula subtracts cached input tokens from total input before
applying the uncached-input rate. The stored pricing source/date/version
accompanies calculated costs. Missing usage or an unrecognized model rate is
recorded as unknown, not zero. These are model-token estimates only; database,
hosting, Fetch/package, network, and other infrastructure costs are not
measured.

## Frontend verification and troubleshooting

Start `npm run dev`, open `http://localhost:3000/agent-logs`, and check that the
screen renders, filters are usable, and rows match PostgreSQL records for a
known `run_id`. The screen is developer/demo-only. A manual load during this
implementation rendered successfully but showed zero records, so row accuracy
was not established. Do not expose it as an administrator console in
production.

Common checks:

- **401/503 from MCP:** verify `DIRA_MCP_ACCESS_TOKEN` and
  `DIRA_MCP_SERVER_URL` in the server environment; do not put the token in the
  browser.
- **No MCP tools or tool call fails:** verify the server process is running,
  the endpoint ends in `/api/mcp/server`, and the client uses Streamable HTTP.
- **Fetch provider error:** ensure `FETCH_MCP_ENABLED=true`, `uvx` is installed
  and visible to the Dira server process, and outbound network access works.
  On Windows, `FETCH_MCP_COMMAND` can name the full executable path.
- **No/partial education results:** inspect each source's error category and
  HTTP status. A 403, 404, oversized page, timeout, or extraction failure is an
  explicit limitation, not a reason to bypass the domain or content-size guard.
- **Cache or log schema errors:** confirm migrations 002 and 009 were applied
  to the same PostgreSQL database referenced by the running process.
- **No activity rows:** check database connectivity and query the correlated
  `run_id`; logger failures are reported in server output and do not fabricate
  a persisted event.

## Existing linked-test MCP demonstration

The older `npm run mcp:test` client selects an eligible accepted test for the
same trusted demo teacher context. It writes no observation, but it requires
existing demo data and can therefore report no eligible test. The separate
`npm run mcp:test:external` command is the independent HTTP MCP discovery and
read-only retrieval smoke test described above.
