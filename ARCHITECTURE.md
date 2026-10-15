# Dira - Architecture Summary

> **Status:** High-level architecture overview. Detailed system design, flows, data models, and guardrails live in [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md).
>
> **Audience:** Developers, reviewers, and stakeholders who need the essential technical picture.

## 1. System Overview

Dira helps teachers collect observations, explore questions via small classroom tests, and review an evidence-grounded Learner Evidence Card. The agent recommends; the teacher decides.

## 2. Technology Stack

| Layer | Technology | Provider |
|---|---|---|
| Frontend | Next.js App Router + React + TypeScript | Dira code |
| Orchestration | LangGraph.js (open-source) | Dira code |
| LLM | GLM-5.3 Flash (open-weight model) | Hosted Z.AI API |
| Transcription | OpenAI Audio Transcriptions (frontier model) | Hosted API (MVP — replace with self-hosted open-weight before go-live) |
| SMS / Voice | Africa's Talking | Hosted API |
| Database | PostgreSQL | Dira data store |
| Calendar | Keeper.sh (MCP) | Borrowed MCP server |

## 3. Agent Architecture and Workflow

```
Teacher action -> App Router -> LangGraph.js workflow -> [MCP tools] -> GLM-5.3 -> [MCP tools] -> PostgreSQL
```

- **Orchestrator** (`lib/agent/orchestrator.ts`) coordinates bounded, scheduled follow-up work.
- **Suggest Test graph** (`lib/agent/suggest-test-graph.ts`) runs in the request path:
  1. Retrieve authorized learner evidence and test history (Dira MCP tools)
  2. Retrieve bounded educational resources (Dira MCP tool → external retrieval adapter)
  3. Prepare cited context → send to GLM-5.3 via `lib/models.ts`
  4. Validate structured output (deterministic checks + one retry)
  5. Persist validated suggestion (Dira MCP tool) → PostgreSQL
- Nodes communicate via the **MCP SDK in-process transport** — not recursive HTTP calls.

## 4.MCP Servers and External Integrations: built vs borrowed

### DIRA MCP Server

Dira owns 13 MCP tools served by a single in-process MCP server (`lib/mcp-tools/dira-server.ts`):

| Tool | Purpose |
|---|---|
| `log_observation` | Validate and persist teacher observations with provenance |
| `suggest_test` | Start the LangGraph.js Suggest Test workflow |
| `get_learner_observations` | Retrieve authorized evidence for a learner |
| `get_previous_suggestions` | Retrieve past test suggestions and outcomes |
| `retrieve_education_resources` | Discover bounded, relevance-ranked excerpts from approved education domains |
| `persist_test_suggestion` | Save a validated SUGGESTED test proposal |
| `build_evidence_summary` | Assemble a ground ed Evidence Card summary |
| `prepare_daily_follow_up_queue` | Queue follow-up work for a teacher's learners |
| `list_due_follow_ups` | Fetch due follow-up items |
| `dispatch_one_due_follow_up` | Dispatch one scheduled follow-up item |
| `draft_pathway_note` | Evidence summary and hypothesis assessment (read-only — does not assign pathways) |
| *(+ see server for remaining tools)* | |

**Why built:** These encapsulate Dira's core domain logic — observation persistence, evidence retrieval, test suggestion, and evidence summarization. They enforce validation, safety constraints, and teacher authorization at the tool boundary.

### External MCP Server: Keeper.sh

| Server | URL | Why borrowed |
|---|---|---|
| Keeper.sh | `https://www.keeper.sh/mcp` | Single MCP interface for Google Calendar, Outlook/Microsoft 365, iCloud, Fastmail, CalDAV, and read-only ICS/iCal feeds |

**Why borrowed:** Rather than implementing and maintaining separate calendar-provider adapters, Dira uses Keeper.sh as a unified, MCP-compliant gateway. Calendar data is timing context only — it never proves a lesson happened or a learner attended.

### External APIs

| Service | Why not MCP | Integration |
|---|---|---|
| GLM-5.3 API | Hosted model API, not an MCP server | Direct API call via `lib/models.ts` abstraction |
| OpenAI STT | Hosted transcription API, not an MCP server | Direct API call for MVP — replace before go-live |
| Africa's Talking SMS/Voice | Hosted communication APIs, not MCP servers | Direct API calls for reminders and follow-up calls |

> **Key principle:** An external API is not automatically an MCP server. Dira connects to Keeper.sh through the MCP protocol. All other external services are integrated via direct API calls.

## 5. MCP Client and Tool Communication

`lib/agent/mcp-client.ts` provides:

- Streamable HTTP transport through the official MCP SDK
- OAuth provider injection
- Tool discovery and invocation
- Request timeouts and error propagation
- Tracing and logging (without chain-of-thought)

The client connects to both Dira's own in-process MCP server (for Dira tools) and the remote Keeper.sh server (for calendar integration).

## 6. Language Model Abstraction

`lib/models.ts` keeps the GLM-5.3 provider/model configuration replaceable and server-side. No model keys are exposed in client components. The abstraction allows swapping providers without changing agent orchestration code.

## 7. Database and Data Management

PostgreSQL is the system of record for:

- Learners, observations, questions, tests, outcomes, and evidence references
- Versioned hypothesis assessments (`hypothesis_assessments` table)
- Follow-up queue jobs (`teacher_follow_up_jobs` table)
- School calendar and attendance contexts

See [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md) for the full entity-relationship diagram.

## 8. Guardrails/ Safety, Evidence, and Governance

- **No learner classification:** observations are factual records; evidence summaries are grounded and validated, never diagnoses or pathway assignments.
- **Evidence before conclusions:** every factual claim in a summary is traceable to source records.
- **Teacher decides:** the agent suggests activities; teachers accept, reject, or request alternatives.
- **Source integrity:** external educational guidance is context only, cited only when retrieved within a strict timeout.
- **Secrets stay server-side:** no API keys in client code or environment files committed to git.

## 9. Further Documentation

See [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) for the full end-to-end journey, architecture diagrams, guardrail details, repository map, and evaluation expectations.
