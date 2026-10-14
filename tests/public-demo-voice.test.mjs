import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  phoneCount: 0,
  globalCount: 0,
  queries: [],
  client: null,
}));

vi.mock("../lib/db/client.ts", () => ({
  pool: {
    connect: vi.fn(async () => database.client),
    query: vi.fn(async () => ({ rowCount: 1 })),
  },
}));

const {
  PublicDemoCallLimitError,
  reservePublicDemoCall,
} = await import("../lib/services/public-demo-voice.ts");

const SECRET = "a-long-test-only-rate-limit-secret-value";
const envKeys = ["DEMO_CALL_RATE_LIMIT_SECRET"];
let originalEnv;

function createClient() {
  return {
    query: vi.fn(async (sql, values = []) => {
      database.queries.push({ sql, values });
      if (sql.includes("COUNT(*) FILTER")) {
        return {
          rows: [
            {
              phone_count: database.phoneCount,
              global_count: database.globalCount,
            },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    }),
    release: vi.fn(),
  };
}

beforeEach(() => {
  originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.DEMO_CALL_RATE_LIMIT_SECRET = SECRET;
  database.phoneCount = 0;
  database.globalCount = 0;
  database.queries = [];
  database.client = createClient();
});

afterEach(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("public demo voice rate limits", () => {
  it("reserves a call atomically and persists only a keyed phone hash", async () => {
    const eventId = await reservePublicDemoCall("+254712345678");
    const insert = database.queries.find(({ sql }) => sql.includes("INSERT INTO"));
    const expectedHash = createHmac("sha256", SECRET)
      .update("+254712345678")
      .digest("hex");

    expect(eventId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(database.queries.some(({ sql }) => sql.includes("pg_advisory_xact_lock"))).toBe(
      true,
    );
    expect(insert.values[1]).toBe(JSON.stringify({ phone_hash: expectedHash }));
    expect(insert.values.join(" ")).not.toContain("+254712345678");
    expect(database.client.release).toHaveBeenCalledOnce();
  });

  it("rejects a number that has already requested a call in the current window", async () => {
    database.phoneCount = 1;

    await expect(reservePublicDemoCall("+254712345678")).rejects.toMatchObject({
      name: PublicDemoCallLimitError.name,
      limit: "number",
    });
    expect(database.client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(database.client.release).toHaveBeenCalledOnce();
  });

  it("enforces the global rolling daily limit", async () => {
    database.globalCount = 10;

    await expect(reservePublicDemoCall("+254712345678")).rejects.toMatchObject({
      name: PublicDemoCallLimitError.name,
      limit: "global",
    });
  });

  it("requires a long rate-limit secret and valid E.164 phone numbers", async () => {
    process.env.DEMO_CALL_RATE_LIMIT_SECRET = "short";
    await expect(reservePublicDemoCall("+254712345678")).rejects.toThrow(
      "at least 32 bytes",
    );
    process.env.DEMO_CALL_RATE_LIMIT_SECRET = SECRET;
    await expect(reservePublicDemoCall("0712345678")).rejects.toThrow(
      "E.164 format",
    );
  });
});
