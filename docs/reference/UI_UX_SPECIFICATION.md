# Dira — UI/UX Specification

> **Visual reference location:** keep approved screen images in `docs/design/`. Expected reference filenames are listed below as conventions; verify that the actual images exist before treating these links as resolved. This document follows the current architecture and the teacher-only MVP.

## 1. Experience principles

- **Teacher's window into the work:** the interface is a useful view into a workflow designed around a teacher's existing day, not another complex administration portal.
- **Quick capture:** text and voice use one clear Log Observation surface; do not make voice a separate, confusing destination.
- **Evidence is visible:** suggestions show their supporting observations and the card shows the questions, tests and outcomes that actually exist.
- **Clear state:** distinguish suggested, accepted/planned, deferred, and completed. Never imply that a scheduled or accepted activity happened.
- **Non-judgemental language:** use “something worth exploring,” “evidence so far,” and “not enough recorded evidence yet,” rather than labels or pathway verdicts.
- **Responsive by default:** support a compact mobile layout for teachers using phones and a wider desktop layout for review.
- **Accessible controls:** clear labels, visible focus, readable contrast, keyboard support and non-colour status cues.

## 2. Navigation and page hierarchy

Current teacher-facing destinations:

1. **This Week** — short weekly focus list.
2. **Learners / Learner Record** — list and longitudinal record.
3. **Try This** — suggested activity with evidence and teacher actions.
4. **Learner Evidence Card** — questions explored, tests conducted, observed outcomes and gaps.
5. **Log Observation** — supporting capture workflow launched from a learner record or test outcome; it is not a separate top-level destination.

The current architecture includes both `app/(teacher)/this-week/page.tsx` and `app/dashboard/page.tsx`. Inspect current links and routing before deciding whether `/dashboard` is an alias, redirect, or separate screen. Avoid duplicate destinations that confuse teachers.

## 3. Approved design references

Place the approved design images in `docs/design/` with consistent filenames:

| Filename convention | Screen |
|---|---|
| `this-week.png` | This Week |
| `learner-record.png` | Learner Record |
| `try-this.png` | Try This |
| `learner-evidence-card.png` | Learner Evidence Card |
| `log-observation-chat.png` | Supporting chat-style capture flow, mobile and desktop |

These names are recommended conventions from the architecture; they do not prove that the image files are currently committed.

## 4. Screen specifications

### 4.1 This Week

**Purpose:** Give the teacher a fast answer to “Who should I make a point of noticing this week?”

**Content:**
- Page heading and concise explanation of the weekly focus.
- List of learners selected by least-recently-observed rotation or a clearly stated operational reason.
- Learner display name and available class/grade context; avoid extra sensitive details.
- Last observation date or a clear “No observations recorded yet” state.
- Direct action to open each Learner Record.

**Behaviour:**
- Rotation must not be random if recency information exists.
- If the list is empty or the rotation calculation fails, explain that state rather than showing fabricated people.
- If SMS reminder status is shown, reflect Africa's Talking's actual response/delivery status; do not imply delivery before confirmation.

**Suggested copy:** “This week, keep an eye out for these learners. You do not need to do anything differently—just notice what you normally notice.”

### 4.2 Learner Record

**Purpose:** Let the teacher understand what has actually been recorded for one learner.

**Content:**
- Learner's basic display details, such as name and class/grade, only where provided by the dataset.
- Chronological observation timeline.
- Each observation: content, timestamp, observer/role, subject/context, observation type, capture method, and linked test if applicable.
- Open questions worth exploring.
- Relevant test cards and accurate lifecycle status.
- Action to Log Observation and action to open Try This when a valid suggestion exists.

**Behaviour:**
- Keep original observation text available; do not replace it with AI-cleaned wording.
- Keep observation and any interpretation clearly distinct.
- Do not imply that a missing category indicates learner weakness.
- Link test-result observations to the test that prompted the activity.

### 4.3 Log Observation (supporting flow)

**Purpose:** Capture what the teacher noticed with minimal effort.

**Layout:** A chat-style conversation with a unified bottom composer. On desktop, the conversation uses the main content area; on mobile, it occupies the usable screen width and leaves the composer accessible. The composer supports both typing and voice recording.

**Components:**
- `ObservationChat.tsx`: conversation container and workflow state.
- `ObservationMessage.tsx`: teacher messages, transcription preview, status and save confirmation.
- `ObservationComposer.tsx`: unified text input, record/send actions and appropriate disabled/loading states.
- Existing `VoiceNoteRecorder.tsx`: recording controls; adapt/reuse rather than creating a second recorder.
- `RecordingPreview.tsx`: listen/review, submit or discard.
- `ObservationTypeSelector.tsx`: select the observation category/context required by the implemented schema.

**Behaviour:**
- Clearly show the selected learner in the context/header so the teacher can catch a wrong learner before submission.
- While voice transcription is processing, show a real processing state.
- If transcription changes a critical detail or is unclear, ask for confirmation before saving.
- “Saved” appears only after `log_observation` returns confirmed persistence.
- On error, retain unsaved text/audio where feasible and explain the next action.

**Suggested copy:** “What did you notice?” / “Type an observation or record a quick voice note.”

### 4.4 Try This

**Purpose:** Present a practical, evidence-grounded classroom activity that helps the teacher explore a question, not confirm a predefined label.

**Content:**
- Neutral framing: “Something worth exploring.”
- Exploration question/hypothesis, explicitly tentative.
- Suggested activity steps, purpose, approximate duration/effort and what the teacher should observe.
- Exact supporting observations (IDs plus human-readable date/subject/summary from real records).
- Educational guidance, only when external retrieval actually returned relevant material; include genuine source links/metadata.
- External retrieval status if guidance was unavailable, worded without technical overload.
- Three teacher actions: **I'll try this**, **Not yet**, **Suggest another**.

**Behaviour:**
- Do not label the learner or imply that the activity is a diagnosis.
- The teacher's acceptance changes status to accepted/planned only.
- “Not yet” must not be conflated with rejection due to learner ability.
- “Suggest another” generates a new or versioned suggestion and preserves audit history.
- Do not display citations without validating the underlying evidence and source retrieval result.

### 4.5 Learner Evidence Card

**Purpose:** Give the teacher an understandable, traceable view of what has been explored and what the evidence currently says—and does not say.

**Required sections:**
- **Questions explored:** the open questions/hypotheses under investigation.
- **Tests conducted:** only tests with teacher-recorded outcomes are presented as completed; suggested/accepted tests remain visibly incomplete.
- **Observed outcomes:** actual teacher observations linked to tests.
- **Supporting evidence:** real observation references and context.
- **What remains unclear:** gaps, contradictions, limited context and timeframe.
- **Next question / possible next step:** where supported, a question or activity to explore next, leaving the decision to the teacher.
- **Disclaimer:** recorded evidence supports professional judgement; it is not a diagnosis, ranking, verdict or assigned pathway.

**Behaviour:**
- Build from current database records and validate every relation.
- Display time range explicitly.
- Treat missing records as “not recorded,” not as failure or lack of ability.
- Do not use fixed learner traits such as “natural leader,” “visual learner,” or “future engineer.”
- The current MVP is teacher-only: no guardian approval CTA, delivery action, or pathway-note review queue.

## 5. Responsive and accessibility behaviour

- Mobile: prioritise a single column, large tap targets, visible composer controls, readable evidence references and minimal horizontal scrolling.
- Desktop: use the width for context and timeline, but keep the visual hierarchy shallow and readable.
- Buttons must have text labels or accessible names; mic/send icons alone are insufficient.
- Provide keyboard-operable input, recording controls and modal/preview actions.
- Status must not be conveyed by colour alone; pair colour with text/icon/label.
- Loading states should explain the active operation (transcribing, saving, retrieving guidance) and should not promise completion.
- Error messages should state what failed and what the teacher can do next.

## 6. Shared states and copy rules

| State | UI treatment |
|---|---|
| Loading observations | Show a neutral loading state; no placeholder content that could be mistaken for evidence |
| No observations | “No observations have been recorded yet.” |
| Save in progress | Disable duplicate submission and show “Saving…” |
| Save confirmed | Show confirmation and the real observation reference if available |
| Save failed | Explain that the observation was not confirmed as saved; offer retry and preserve input where possible |
| Transcription uncertain | Ask teacher to review/correct the transcript before saving |
| Retrieval succeeded | Cite the source actually returned; distinguish it from learner evidence |
| Retrieval timed out/failed | State that educational guidance could not be retrieved for this suggestion; continue without fabricated citations |
| Evidence insufficient | Explain the gap and suggest observing further rather than producing a verdict |
| Contradictory evidence | Show the disagreement and keep the question open |

## 7. Design and engineering boundaries

- UI components render data and capture user action; provider secrets and raw database access stay server-side.
- UI status comes from backend status, not optimistic assumptions.
- The frontend does not connect directly to PostgreSQL or directly to Keeper's provider accounts.
- Do not invent additional pages such as Reviews or Guardian Delivery for this MVP merely because older notes depict them.
- Inspect and reuse existing components before creating duplicates.
