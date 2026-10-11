import type { ObservationType } from "../db/schema";
import { randomUUID } from "node:crypto";

export interface SuggestTestContext {
	teacher_id: string;
	school_id: string;
}

export interface SuggestionObservation {
	observation_id: string;
	learner_id: string;
	teacher_id: string;
	observation_type: ObservationType;
	original_observation: string;
	reviewed_observation: string | null;
	observation_date: string;
	observed_at: Date | string;
	activity_context: string | null;
	subject: string | null;
	term: string | null;
	possible_theme: string | null;
	teacher_review_status: "not_required" | "recorded" | "confirmed" | "updated";
}

export interface GroupedObservationType {
	observation_type: ObservationType;
	observation_ids: string[];
	eligible_observation_ids: string[];
	awaiting_review_ids: string[];
}

export interface EvidenceCitation {
	observation_id: string;
	observation_type: ObservationType;
	observed_at: string;
	teacher_id: string;
	subject: string | null;
	activity_context: string | null;
	content: string;
}

export interface SuggestedActivity {
	title: string;
	duration_minutes: number;
	purpose: string;
	steps: string[];
	what_to_observe: string[];
}

export interface EvidenceSignal {
	kind: "single_observation" | "repeated_signal";
	observation_type: ObservationType;
	possible_theme: string | null;
	observation_ids: string[];
	variation_observation_ids: string[];
	distinct_dates: number;
	distinct_teachers: number;
	distinct_contexts: number;
	duplicate_observation_ids: string[];
	status: "under_corroborated" | "more_corroborated";
}

export type SuggestTestResult =
	| {
			ok: false;
			status: "learner_not_found" | "teacher_not_authorized" | "needs_review" | "insufficient_evidence" | "no_suitable_activity";
			learner_id: string;
			message: string;
			grouped_observations: GroupedObservationType[];
			under_corroborated_signals: EvidenceSignal[];
		}
	| {
			ok: true;
			status: "proposed";
			learner_id: string;
			exploration_question: string;
			hypothesis: string;
			reason: string;
			cited_observations: EvidenceCitation[];
			suggested_activity: SuggestedActivity;
			what_to_log_afterward: string[];
			grouped_observations: GroupedObservationType[];
			under_corroborated_signals: EvidenceSignal[];
			prior_test_ids: string[];
			limitations: string[];
		};

export interface PriorTestRow {
	test_id: string;
	suggested_activity: string;
	activity_date: string;
	status: "Accepted" | "Completed" | "In progress" | "Pending";
	evidence_ids: string[];
}

export interface AcceptSuggestionInput {
	learner_id: string;
	submission_id: string;
	planned_date: string;
}

export interface AcceptedSuggestionResult {
	test_id: string;
	learner_id: string;
	status: "Accepted";
	activity_date: string;
	duplicate: boolean;
}

export class SuggestionPersistenceError extends Error {
	constructor(message: string, public readonly status: number) {
		super(message);
		this.name = "SuggestionPersistenceError";
	}
}

interface SignalGroup {
	observation_type: ObservationType;
	observations: SuggestionObservation[];
}

const REVIEWED_STATUSES = new Set(["not_required", "confirmed", "updated"]);

const ACTIVITY_BY_TYPE: Partial<Record<ObservationType, SuggestedActivity>> = {
	participation: {
		title: "Rotating-role group challenge",
		duration_minutes: 10,
		purpose: "Explore how the learner contributes when the group task and role vary.",
		steps: [
			"Give a small group one short, familiar classroom challenge.",
			"Let learners choose or rotate simple roles such as idea collector and reporter.",
			"Do not assign the learner a leadership role or require them to speak publicly.",
		],
		what_to_observe: [
			"Whether and when the learner offers an idea or builds on another idea.",
			"Which role and group arrangement were used.",
			"What prompts or supports were offered.",
		],
	},
	academic: {
		title: "Two-way mini problem",
		duration_minutes: 10,
		purpose: "Explore how the learner approaches and explains a short subject task.",
		steps: [
			"Choose one short problem from the current lesson.",
			"Offer a familiar representation and an optional second representation.",
			"Invite the learner to describe their approach; accepting a pass is fine.",
		],
		what_to_observe: [
			"The approach or representation the learner chooses.",
			"Any explanation, question, or support requested.",
			"Whether the second representation changes the approach.",
		],
	},
	behavioral: {
		title: "Short task with optional checklist",
		duration_minutes: 10,
		purpose: "Explore how task structure and optional support affect the learner's approach.",
		steps: [
			"Offer a familiar, short multi-step classroom task.",
			"Make a simple checklist and one optional hint available to everyone.",
			"Let the learner decide whether to use either support.",
		],
		what_to_observe: [
			"The steps attempted and the order chosen.",
			"Whether the checklist or hint was used.",
			"What happened after support was offered, without rating the learner.",
		],
	},
	extracurricular: {
		title: "Learner-choice contribution",
		duration_minutes: 10,
		purpose: "Explore participation in a short, learner-chosen enrichment task.",
		steps: [
			"Offer two familiar, low-preparation enrichment options.",
			"Let the learner choose whether and how to contribute.",
			"Use a pair or small group and allow a non-speaking contribution.",
		],
		what_to_observe: [
			"Which option and contribution format the learner chooses.",
			"How the setting differs from the original observations.",
			"Any support or peer arrangement that affected participation.",
		],
	},
};

function uniqueObservations(observations: SuggestionObservation[]): SuggestionObservation[] {
	const byId = new Map<string, SuggestionObservation>();
	for (const observation of observations) {
		if (!byId.has(observation.observation_id)) {
			byId.set(observation.observation_id, observation);
		}
	}
	return [...byId.values()];
}

function normalize(value: string): string {
	return value.toLowerCase().trim().replace(/\s+/g, " ");
}

export function groupObservationsByType(
	observations: SuggestionObservation[],
): GroupedObservationType[] {
	const groups = new Map<ObservationType, GroupedObservationType>();
	for (const observation of uniqueObservations(observations)) {
		let group = groups.get(observation.observation_type);
		if (!group) {
			group = {
				observation_type: observation.observation_type,
				observation_ids: [],
				eligible_observation_ids: [],
				awaiting_review_ids: [],
			};
			groups.set(observation.observation_type, group);
		}
		group.observation_ids.push(observation.observation_id);
		if (REVIEWED_STATUSES.has(observation.teacher_review_status)) {
			group.eligible_observation_ids.push(observation.observation_id);
		} else {
			group.awaiting_review_ids.push(observation.observation_id);
		}
	}
	return [...groups.values()].sort((left, right) =>
		left.observation_type.localeCompare(right.observation_type),
	);
}

function makeSignalGroups(observations: SuggestionObservation[]): SignalGroup[] {
	const groups = new Map<ObservationType, SignalGroup>();
	for (const observation of uniqueObservations(observations)) {
		if (!REVIEWED_STATUSES.has(observation.teacher_review_status)) continue;
		let group = groups.get(observation.observation_type);
		if (!group) {
			group = {
				observation_type: observation.observation_type,
				observations: [],
			};
			groups.set(observation.observation_type, group);
		}
		group.observations.push(observation);
	}
	return [...groups.values()];
}

export function findUnderCorroboratedSignals(
	observations: SuggestionObservation[],
): EvidenceSignal[] {
	const signals: EvidenceSignal[] = [];
	for (const group of makeSignalGroups(observations)) {
		const seenEvents = new Set<string>();
		const distinct: SuggestionObservation[] = [];
		const duplicates: string[] = [];

		for (const observation of group.observations) {
			const content = normalize(observation.reviewed_observation ?? observation.original_observation);
			const eventKey = [
				observation.teacher_id,
				observation.observation_date,
				observation.observation_type,
				normalize(observation.activity_context ?? ""),
				content,
			].join("\u0000");
			if (seenEvents.has(eventKey)) {
				duplicates.push(observation.observation_id);
			} else {
				seenEvents.add(eventKey);
				distinct.push(observation);
			}
		}

		const dates = new Set(distinct.map((item) => item.observation_date));
		const teachers = new Set(distinct.map((item) => item.teacher_id));
		const contexts = new Set(
			distinct.map((item) => normalize(item.activity_context ?? "")).filter(Boolean),
		);
		const narratives = new Set(
			distinct.map((item) => normalize(item.reviewed_observation ?? item.original_observation)),
		);
		const underCorroborated =
			distinct.length < 3 || teachers.size < 2 || contexts.size < 2 || dates.size < 3;
		signals.push({
			kind: distinct.length < 2 || dates.size < 2 ? "single_observation" : "repeated_signal",
			observation_type: group.observation_type,
			possible_theme: (() => {
				const themes = new Set(
					group.observations
						.map((item) => item.possible_theme?.trim())
						.filter((theme): theme is string => Boolean(theme))
						.map(normalize),
				);
				return themes.size === 1 ? group.observations.find((item) => item.possible_theme?.trim())?.possible_theme?.trim() ?? null : null;
			})(),
			observation_ids: distinct.map((item) => item.observation_id),
			variation_observation_ids: narratives.size > 1
				? distinct.map((item) => item.observation_id)
				: [],
			distinct_dates: dates.size,
			distinct_teachers: teachers.size,
			distinct_contexts: contexts.size,
			duplicate_observation_ids: duplicates,
			status: underCorroborated ? "under_corroborated" : "more_corroborated",
		});
	}

	return signals.sort((left, right) => {
		const leftGaps = Number(left.distinct_teachers < 2) + Number(left.distinct_contexts < 2) + Number(left.distinct_dates < 3);
		const rightGaps = Number(right.distinct_teachers < 2) + Number(right.distinct_contexts < 2) + Number(right.distinct_dates < 3);
		return rightGaps - leftGaps || left.observation_ids.length - right.observation_ids.length;
	});
}

function activityQuestion(type: ObservationType, theme: string | null): string {
	const topic = theme ? ` (tentatively tagged ${theme.toLowerCase()})` : " in this type of activity";
	switch (type) {
		case "participation":
			return `What group arrangements help the learner contribute ideas${topic}?`;
		case "academic":
			return `Which task representation or prompt helps the learner explain their approach${topic}?`;
		case "behavioral":
			return `How does the learner approach a familiar task when optional structure is available${topic}?`;
		case "extracurricular":
			return `How does the learner choose to contribute in a low-pressure enrichment activity${topic}?`;
		default:
			return "What additional classroom context would help clarify these observations?";
	}
}

export function buildSuggestion(
	learnerId: string,
	observations: SuggestionObservation[],
	priorTests: PriorTestRow[],
): SuggestTestResult {
	const grouped = groupObservationsByType(observations);
	const signals = findUnderCorroboratedSignals(observations);
	const eligibleCount = grouped.reduce((sum, group) => sum + group.eligible_observation_ids.length, 0);

	if (observations.length === 0) {
		return {
			ok: false,
			status: "insufficient_evidence",
			learner_id: learnerId,
			message: "The learner has no observations available to support a suggestion.",
			grouped_observations: grouped,
			under_corroborated_signals: signals,
		};
	}
	if (eligibleCount === 0) {
		return {
			ok: false,
			status: "needs_review",
			learner_id: learnerId,
			message: "The learner has observations, but none are currently eligible as reviewed evidence.",
			grouped_observations: grouped,
			under_corroborated_signals: signals,
		};
	}

	const candidates = signals.filter(
		(signal) => signal.kind === "repeated_signal" && signal.status === "under_corroborated",
	);
	const candidate = candidates.find((signal) => Boolean(ACTIVITY_BY_TYPE[signal.observation_type]));
	if (!candidate) {
		return {
			ok: false,
			status: signals.length > 0 ? "no_suitable_activity" : "insufficient_evidence",
			learner_id: learnerId,
			message: signals.length > 0
				? "Repeated signals exist, but no low-preparation activity is mapped to their observation type."
				: "There is not yet a repeated, independently dated signal suitable for a follow-up activity.",
			grouped_observations: grouped,
			under_corroborated_signals: signals,
		};
	}

	const openPriorTest = priorTests.find((test) =>
		test.status !== "Completed" && test.evidence_ids.some((id) => candidate.observation_ids.includes(id)),
	);
	if (openPriorTest) {
		return {
			ok: false,
			status: "insufficient_evidence",
			learner_id: learnerId,
			message: `An existing ${openPriorTest.status.toLowerCase()} activity already cites this evidence. Record its outcome before suggesting another activity.`,
			grouped_observations: grouped,
			under_corroborated_signals: signals,
		};
	}

	const activity = ACTIVITY_BY_TYPE[candidate.observation_type]!;
	const citedIds = new Set(candidate.observation_ids);
	const citedObservations = uniqueObservations(observations)
		.filter((observation) => citedIds.has(observation.observation_id))
		.map((observation) => ({
			observation_id: observation.observation_id,
			observation_type: observation.observation_type,
			observed_at: observation.observation_date,
			teacher_id: observation.teacher_id,
			subject: observation.subject,
			activity_context: observation.activity_context,
			content: observation.reviewed_observation ?? observation.original_observation,
		}));
	const question = activityQuestion(candidate.observation_type, candidate.possible_theme);

	return {
		ok: true,
		status: "proposed",
		learner_id: learnerId,
		exploration_question: question,
		hypothesis: `These reviewed records may be worth exploring across another task or setting. They do not establish a fixed learner characteristic.`,
		reason: `The tentative ${candidate.observation_type} signal appears on ${candidate.distinct_dates} dates, with ${candidate.distinct_teachers} teacher(s) and ${candidate.distinct_contexts} recorded context(s). The limited spread is a reason to gather more evidence, not to draw a conclusion.`,
		cited_observations: citedObservations,
		suggested_activity: activity,
		what_to_log_afterward: [
			"Record the activity, date, subject, group arrangement, and the learner's role or choice.",
			"Describe observable actions and any prompts or support offered, using the teacher's own wording.",
			"Note what differed from the cited observations; avoid rating the learner from one activity.",
		],
		grouped_observations: grouped,
		under_corroborated_signals: signals,
		prior_test_ids: priorTests.map((test) => test.test_id),
		limitations: [
			"possible_theme is a tentative synthetic/teacher-entered tag, not a verified conclusion.",
			"Exact-text duplicate detection cannot detect paraphrases or determine whether different narratives conflict.",
			...(candidate.variation_observation_ids.length
				? ["Cited observations vary in wording; this is context to explore, not an automatically resolved contradiction."]
				: []),
			"A single activity cannot establish a stable learner characteristic.",
		],
	};
}

export async function suggestTest(
	learnerIdInput: string,
	context: SuggestTestContext,
): Promise<SuggestTestResult> {
	const learnerId = learnerIdInput.trim();
	if (!learnerId || !context.teacher_id.trim() || !context.school_id.trim()) {
		throw new Error("learner_id and trusted teacher/school context are required");
	}

	const { pool } = await import("../db/client");
	const teacher = await pool.query(
		`SELECT 1 FROM teachers WHERE teacher_id = $1 AND school_id = $2 LIMIT 1`,
		[context.teacher_id, context.school_id],
	);
	if (!teacher.rowCount) {
		return {
			ok: false,
			status: "teacher_not_authorized",
			learner_id: learnerId,
			message: "The trusted teacher is not authorized for the selected school.",
			grouped_observations: [],
			under_corroborated_signals: [],
		};
	}
	const enrollment = await pool.query(
		`SELECT 1
		 FROM learner_enrollments
		 WHERE learner_id = $1 AND school_id = $2
		 LIMIT 1`,
		[learnerId, context.school_id],
	);
	if (!enrollment.rowCount) {
		return {
			ok: false,
			status: "learner_not_found",
			learner_id: learnerId,
			message: "No enrollment was found for this learner in the selected school.",
			grouped_observations: [],
			under_corroborated_signals: [],
		};
	}

	const observations = await pool.query<SuggestionObservation>(
		`SELECT observation_id, learner_id, teacher_id, observation_type,
						original_observation, reviewed_observation, observed_at,
				observation_date::text AS observation_date,
						activity_context, subject, term, possible_theme,
						teacher_review_status
		 FROM observations
		 WHERE learner_id = $1 AND school_id = $2
		 ORDER BY observed_at ASC, observation_id ASC`,
		[learnerId, context.school_id],
	);
	const priorTests = await pool.query<PriorTestRow>(
		`SELECT t.test_id, t.suggested_activity, t.activity_date, t.status,
						COALESCE(
							array_agg(ato.observation_id)
								FILTER (WHERE ato.observation_id IS NOT NULL),
							ARRAY[]::text[]
						) AS evidence_ids
		 FROM activity_tests t
		 LEFT JOIN activity_test_observations ato
			 ON ato.test_id = t.test_id AND ato.learner_id = t.learner_id
		 WHERE t.learner_id = $1
			 AND EXISTS (
				 SELECT 1 FROM learner_enrollments e
				 WHERE e.learner_id = t.learner_id AND e.school_id = $2
			 )
		 GROUP BY t.test_id
		 ORDER BY t.activity_date DESC, t.test_id`,
		[learnerId, context.school_id],
	);

	return buildSuggestion(learnerId, observations.rows, priorTests.rows);
}

function isDateOnly(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function activityText(activity: SuggestedActivity): string {
	return [
		activity.title,
		`Purpose: ${activity.purpose}`,
		"Steps:",
		...activity.steps.map((step) => `- ${step}`),
		"What to observe:",
		...activity.what_to_observe.map((item) => `- ${item}`),
	].join("\n");
}

function persistedSuggestion(suggestion: Extract<SuggestTestResult, { ok: true }>) {
	return {
		exploration_question: suggestion.exploration_question,
		hypothesis: suggestion.hypothesis,
		reason: suggestion.reason,
		suggested_activity: suggestion.suggested_activity,
		what_to_log_afterward: suggestion.what_to_log_afterward,
		evidence_ids: suggestion.cited_observations.map((item) => item.observation_id),
		limitations: suggestion.limitations,
	};
}

export async function acceptSuggestion(
	input: AcceptSuggestionInput,
	context: SuggestTestContext,
): Promise<AcceptedSuggestionResult> {
	const learnerId = input.learner_id.trim();
	const submissionId = input.submission_id.trim();
	const plannedDate = input.planned_date.trim();
	if (!learnerId || !context.teacher_id.trim() || !context.school_id.trim()) {
		throw new SuggestionPersistenceError("learner_id and trusted teacher/school context are required", 400);
	}
	if (!submissionId || submissionId.length > 200) {
		throw new SuggestionPersistenceError("A valid submission_id is required", 400);
	}
	if (!isDateOnly(plannedDate)) {
		throw new SuggestionPersistenceError("planned_date must be a valid YYYY-MM-DD date", 400);
	}

	const { pool } = await import("../db/client");
	const existing = await pool.query<{
		test_id: string;
		learner_id: string;
		activity_date: string;
		status: string;
	}>(
		`SELECT t.test_id, t.learner_id, t.activity_date::text, t.status
		 FROM activity_tests t
		 JOIN learner_enrollments e
		   ON e.learner_id = t.learner_id AND e.school_id = $3
		 WHERE t.approval_submission_id = $1
		   AND t.learner_id = $2
		   AND t.conducting_teacher_id = $4
		 LIMIT 1`,
		[submissionId, learnerId, context.school_id, context.teacher_id],
	);
	if (existing.rows[0]) {
		if (existing.rows[0].activity_date !== plannedDate) {
			throw new SuggestionPersistenceError("submission_id was already used for a different planned date", 409);
		}
		return { ...existing.rows[0], status: "Accepted", duplicate: true };
	}

	const suggestion = await suggestTest(learnerId, context);
	if (!suggestion.ok) {
		throw new SuggestionPersistenceError(suggestion.message, 409);
	}

	const payload = persistedSuggestion(suggestion);
	const evidenceIds = [...new Set(payload.evidence_ids)];
	const testId = `TEST-${randomUUID()}`;
	const client = await pool.connect();
	try {
		await client.query("BEGIN");

		const teacher = await client.query(
			`SELECT 1 FROM teachers WHERE teacher_id = $1 AND school_id = $2`,
			[context.teacher_id, context.school_id],
		);
		if (!teacher.rowCount) {
			throw new SuggestionPersistenceError("Teacher is not registered for this school", 403);
		}

		const enrollment = await client.query(
			`SELECT 1 FROM learner_enrollments
			 WHERE learner_id = $1 AND school_id = $2
			   AND enrolled_from <= $3::date
			   AND (enrolled_to IS NULL OR enrolled_to >= $3::date)
			 LIMIT 1 FOR SHARE`,
			[learnerId, context.school_id, plannedDate],
		);
		if (!enrollment.rowCount) {
			throw new SuggestionPersistenceError("Learner is not enrolled at the planned activity date", 404);
		}

		const currentEvidence = await client.query<{ observation_id: string }>(
			`SELECT observation_id FROM observations
			 WHERE observation_id = ANY($1::text[])
			   AND learner_id = $2 AND school_id = $3
			   AND teacher_review_status = ANY($4::text[])
			 FOR SHARE`,
			[evidenceIds, learnerId, context.school_id, [...REVIEWED_STATUSES]],
		);
		if (currentEvidence.rowCount !== evidenceIds.length) {
			throw new SuggestionPersistenceError("One or more cited observations are no longer eligible evidence", 409);
		}

		const inserted = await client.query<{ test_id: string }>(
			`INSERT INTO activity_tests (
			   test_id, learner_id, suggested_activity, activity_date,
			   conducting_teacher_id, status, approval_submission_id, suggestion_payload
			 )
			 VALUES ($1, $2, $3, $4::date, $5, 'Accepted', $6, $7::jsonb)
			 ON CONFLICT (approval_submission_id) DO NOTHING
			 RETURNING test_id`,
			[
				testId,
				learnerId,
				activityText(suggestion.suggested_activity),
				plannedDate,
				context.teacher_id,
				submissionId,
				JSON.stringify(payload),
			],
		);

		if (!inserted.rows[0]) {
			const raced = await client.query<{
				test_id: string;
				learner_id: string;
				activity_date: string;
				conducting_teacher_id: string;
			}>(
				`SELECT test_id, learner_id, activity_date::text, conducting_teacher_id
				 FROM activity_tests WHERE approval_submission_id = $1`,
				[submissionId],
			);
			const saved = raced.rows[0];
			if (
				!saved || saved.learner_id !== learnerId ||
				saved.activity_date !== plannedDate ||
				saved.conducting_teacher_id !== context.teacher_id
			) {
				throw new SuggestionPersistenceError("submission_id was already used for a different activity", 409);
			}
			await client.query("COMMIT");
			return { test_id: saved.test_id, learner_id: learnerId, status: "Accepted", activity_date: plannedDate, duplicate: true };
		}

		await client.query(
			`INSERT INTO activity_test_observations (test_id, learner_id, observation_id)
			 SELECT $1, $2, evidence_id FROM unnest($3::text[]) AS evidence_id
			 ON CONFLICT DO NOTHING`,
			[testId, learnerId, evidenceIds],
		);
		await client.query("COMMIT");
		return { test_id: testId, learner_id: learnerId, status: "Accepted", activity_date: plannedDate, duplicate: false };
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}