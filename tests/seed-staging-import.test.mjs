import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  assertStagingDatabaseEmpty,
  isSupabaseStagingTarget,
  relationshipRows,
} = require("../scripts/seed-development.cjs");

const projectRef = "abcdefghijklmnopqrst";
const poolerUrl = `postgresql://postgres.${projectRef}:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`;

describe("staging synthetic-data import safeguards", () => {
  it("accepts only the explicitly confirmed Supabase project transaction pooler", () => {
    expect(isSupabaseStagingTarget(poolerUrl, projectRef, projectRef)).toBe(true);
    expect(isSupabaseStagingTarget(poolerUrl, projectRef, "differentprojectref")).toBe(
      false,
    );
    expect(
      isSupabaseStagingTarget(
        `postgresql://postgres.wrongprojectref:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`,
        projectRef,
        projectRef,
      ),
    ).toBe(false);
    expect(
      isSupabaseStagingTarget(
        poolerUrl.replace("sslmode=require", "sslmode=disable"),
        projectRef,
        projectRef,
      ),
    ).toBe(false);
  });

  it("rejects direct database URLs so staging imports use the transaction pooler", () => {
    const directUrl = `postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`;
    expect(isSupabaseStagingTarget(directUrl, projectRef, projectRef)).toBe(false);
  });

  it("blocks staging imports when any synthetic-data table is populated", async () => {
    const emptyClient = { query: vi.fn(async () => ({ rows: [{ has_rows: false }] })) };
    await expect(assertStagingDatabaseEmpty(emptyClient)).resolves.toBeUndefined();

    const populatedClient = {
      query: vi.fn(async (sql) => ({
        rows: [{ has_rows: sql.includes("FROM learners") }],
      })),
    };
    await expect(assertStagingDatabaseEmpty(populatedClient)).rejects.toThrow(
      "learners is not empty",
    );
  });

  it("preserves explicit supporting and contradicting evidence roles", () => {
    expect(
      relationshipRows(
        [
          {
            test_id: "TEST_DEMO",
            learner_id: "L003",
            trigger_observation_ids: "OBS_SUPPORT, OBS_CONTRADICT",
            trigger_observation_roles: "supporting, contradicting",
          },
        ],
        "trigger_observation_ids",
      ).map(({ reference, citation_role }) => [reference, citation_role]),
    ).toEqual([
      ["OBS_SUPPORT", "supporting"],
      ["OBS_CONTRADICT", "contradicting"],
    ]);
  });
});
