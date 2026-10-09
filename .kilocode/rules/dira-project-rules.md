# Dira Project Rules

## Product principles

- Dira supports early pathway exploration through evidence, not learner classification.
- The agent recommends; the teacher decides.
- Never invent observations, evidence IDs, or outcomes.
- Every factual claim in an evidence summary must be traceable to source records.

## Architecture

- Follow ARCHITECTURE.md.
- Use Next.js App Router and TypeScript.
- PostgreSQL is the system of record.
- Core agent operations must use the appropriate Dira MCP tools.
- Keep model configuration replaceable through the model abstraction.

## Integrations

- Use the hosted GLM-5.3 API for the selected model.
- Use Whissle for speech-to-text.
- Use Africa's Talking for both SMS and outbound voice calls.
- Use Google Calendar for the planned scheduling and lesson-context workflows.

## Frontend

- Follow UI_UX_SPECIFICATION.md and the approved design references.
- Implement the four primary screens and the supporting chat-style observation workflow.
- Reuse existing components before creating replacements.
- Keep desktop and mobile experiences responsive.
- Do not redesign approved screens without an explicit request.
- always use logo.png located in public/images

## Development practices

- Inspect the existing repository before creating or moving files.
- Do not duplicate existing functionality.
- Do not claim that an integration or feature works until it has been implemented and tested.
- Keep secrets in environment variables, never in client-side code.
- Report assumptions and unresolved decisions before making consequential architectural changes.