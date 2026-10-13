import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { expect, test, type Page, type Request } from "@playwright/test";
import { Pool } from "pg";

loadEnvConfig(process.cwd(), true);

const learnerId = "L003";
const submissionIds: string[] = [];
const databaseUrl = process.env.DIRA_TEST_DATABASE_URL ??
  process.env.DATABASE_URL;
const parsedDatabaseUrl = databaseUrl ? new URL(databaseUrl) : null;
const databaseIsLocalDevelopment = parsedDatabaseUrl !== null &&
  ["localhost", "127.0.0.1", "::1"].includes(parsedDatabaseUrl.hostname) &&
  parsedDatabaseUrl.port === "5433" &&
  decodeURIComponent(parsedDatabaseUrl.pathname.slice(1)) === "dira_dev" &&
  decodeURIComponent(parsedDatabaseUrl.username) === "dira_dev";

if (!databaseUrl || !databaseIsLocalDevelopment) {
  throw new Error(
    "Suggest Test E2E requires the local dira_dev database on port 5433 as user dira_dev.",
  );
}

const pool = new Pool({ connectionString: databaseUrl });

async function recordSubmissionRequest(request: Request): Promise<void> {
  if (
    request.method() !== "POST" ||
    !request.url().endsWith("/api/mcp/suggest-test")
  ) {
    return;
  }
  const body = request.postDataJSON() as {
    action?: string;
    submission_id?: string;
  };
  if (
    ["suggest", "regenerate"].includes(body.action ?? "") &&
    body.submission_id
  ) {
    submissionIds.push(body.submission_id);
  }
}

async function openLearnerEvidence(page: Page): Promise<void> {
  await page.goto(`/evidence/${learnerId}`, {
    waitUntil: "commit",
  });
  await expect(page.getByRole("heading", { name: "Learner Evidence Card" }))
    .toBeVisible();
  const workflow = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Explore a question" }),
  });
  await expect(workflow.getByRole("button", { name: "Suggest Test" }))
    .toBeEnabled({ timeout: 120_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function cleanupCreatedProposals(): Promise<void> {
  const ids = [...new Set(submissionIds)];
  if (ids.length === 0) return;
  await pool.query("BEGIN");
  try {
    const testIds = await pool.query<{ test_id: string }>(
      `SELECT test_id
       FROM activity_tests
       WHERE approval_submission_id = ANY($1::text[])`,
      [ids],
    );
    const savedIds = testIds.rows.map((row) => row.test_id);
    if (savedIds.length > 0) {
      await pool.query(
        `DELETE FROM activity_test_observations
         WHERE test_id = ANY($1::text[])`,
        [savedIds],
      );
      await pool.query(
        `DELETE FROM activity_tests
         WHERE approval_submission_id = ANY($1::text[])
           AND supersedes_test_id IS NOT NULL`,
        [ids],
      );
      await pool.query(
        `DELETE FROM activity_tests
         WHERE approval_submission_id = ANY($1::text[])`,
        [ids],
      );
    }
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  } finally {
    submissionIds.length = 0;
  }
}

test.beforeAll(async () => {
  const result = await pool.query<{ observation_count: number }>(
    `SELECT COUNT(*)::int AS observation_count
     FROM observations o
     JOIN learner_enrollments e
       ON e.learner_id = o.learner_id
      AND e.class_id = o.class_id
      AND e.academic_year = o.academic_year
     WHERE o.learner_id = $1
       AND o.teacher_review_status IN ('not_required', 'confirmed', 'updated')
       AND e.enrolment_status <> 'Withdrawn'
       AND e.enrolled_from <= CURRENT_DATE
       AND (e.enrolled_to IS NULL OR e.enrolled_to >= CURRENT_DATE)`,
    [learnerId],
  );
  expect(result.rows[0]?.observation_count).toBeGreaterThanOrEqual(2);
});

test.afterAll(async () => {
  try {
    await cleanupCreatedProposals();
  } finally {
    await pool.end();
  }
});

test("generates, rejects, regenerates, persists, and reloads a real learner suggestion", async ({
  page,
}) => {
  page.on("request", recordSubmissionRequest);
  await openLearnerEvidence(page);
  await expect(page.getByRole("heading", { name: "Learner Evidence Card" }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Recorded observations" }))
    .toBeVisible();

  const workflow = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Explore a question" }),
  });
  const suggestResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/api/mcp/suggest-test"),
    { timeout: 120_000 },
  );
  await workflow.getByRole("button", { name: "Suggest Test" }).click();
  const firstResponse = await suggestResponse;
  expect(firstResponse.status()).toBe(200);
  const first = await firstResponse.json();
  expect(first).toMatchObject({
    ok: true,
    status: "proposed",
    learner_id: learnerId,
  });
  expect(first.test_id).toBeTruthy();
  expect(first.cited_observations.length).toBeGreaterThan(0);
  expect(first.suggested_activity.steps.length).toBeGreaterThanOrEqual(2);
  expect(first.suggested_activity.intended_outcome).toBeTruthy();
  expect(first.suggested_activity.assessment_criteria.length).toBeGreaterThan(0);
  expect(first.educational_sources.some((source: { status: string; excerpt: string | null }) =>
    source.status === "success" && Boolean(source.excerpt),
  )).toBe(true);

  await expect(workflow.getByText(first.suggested_activity.title)).toBeVisible();
  await expect(workflow.getByText(/Education sources · (success|partial)/))
    .toBeVisible();
  await expect(workflow.locator("a[href^='https://']").first()).toBeVisible();

  const regenerateResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/api/mcp/suggest-test"),
    { timeout: 120_000 },
  );
  await workflow.getByRole("button", {
    name: "Reject and suggest another",
  }).click();
  const secondResponse = await regenerateResponse;
  expect(secondResponse.status()).toBe(200);
  const regenerated = await secondResponse.json();
  expect(regenerated.rejected_test_id).toBe(first.test_id);
  expect(regenerated.suggestion).toMatchObject({
    ok: true,
    status: "proposed",
    learner_id: learnerId,
  });
  expect(regenerated.suggestion.test_id).toBeTruthy();
  expect(regenerated.suggestion.test_id).not.toBe(first.test_id);
  expect(regenerated.suggestion.suggested_activity.title).not.toBe(
    first.suggested_activity.title,
  );

  await expect(workflow.getByText(regenerated.suggestion.suggested_activity.title))
    .toBeVisible();
  await page.reload();
  await expect(page.getByText("Rejected · replacement suggested")).toBeVisible();
  await expect(page.getByText("Suggested · awaiting teacher decision")).toBeVisible();
  await expect(page.getByText(first.test_id)).toBeVisible();
  await expect(page.getByText(regenerated.suggestion.test_id)).toBeVisible();

  const persisted = await pool.query<{
    status: string;
    supersedes_test_id: string | null;
    evidence_count: number;
    education_source_count: number;
  }>(
    `SELECT t.status, t.supersedes_test_id,
            COUNT(DISTINCT ato.observation_id)::int AS evidence_count,
            jsonb_array_length(t.suggestion_payload->'educational_sources')
              AS education_source_count
     FROM activity_tests t
     LEFT JOIN activity_test_observations ato
       ON ato.test_id = t.test_id AND ato.learner_id = t.learner_id
     WHERE t.approval_submission_id = ANY($1::text[])
     GROUP BY t.test_id`,
    [submissionIds],
  );
  expect(persisted.rows).toHaveLength(2);
  expect(persisted.rows.every((row) => row.status === "SUGGESTED")).toBe(true);
  expect(persisted.rows.every((row) => row.evidence_count > 0)).toBe(true);
  expect(persisted.rows.some((row) => row.supersedes_test_id === first.test_id))
    .toBe(true);
});

test("shows a safe frontend error when the suggestion request fails", async ({
  page,
}) => {
  await openLearnerEvidence(page);
  const workflow = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Explore a question" }),
  });
  await page.route("**/api/mcp/suggest-test", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Evidence test suggestion request failed",
      }),
    });
  });
  await workflow.getByRole("button", { name: "Suggest Test" }).click();
  await expect(workflow.getByRole("status"))
    .toContainText("Evidence test suggestion request failed");
  await expect(workflow.getByRole("button", { name: "Suggest Test" }))
    .toBeVisible();
});
