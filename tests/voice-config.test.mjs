import { afterEach, beforeEach, describe, expect, it } from "vitest";

const envKeys = [
  "NODE_ENV",
  "DIRA_DEMO_MODE",
  "DIRA_ALLOW_PRODUCTION_DEMO_CALLS",
  "DIRA_ALLOW_PUBLIC_DEMO_CALLS",
  "DIRA_DEMO_CALL_TEST_MODE",
  "DIRA_DEMO_CALL_TO",
  "DEMO_CALL_RATE_LIMIT_SECRET",
];
let originalEnv;

const {
  isProductionDemoVoiceEnabled,
  isProductionPublicDemoVoiceEnabled,
} = await import(
  "../lib/services/voice-config.ts"
);

beforeEach(() => {
  originalEnv = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  );
});

afterEach(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("production demo voice gate", () => {
  it("requires production, demo context, explicit opt-in, demo mode, and a valid fixed number", () => {
    Object.assign(process.env, {
      NODE_ENV: "production",
      DIRA_DEMO_MODE: "true",
      DIRA_ALLOW_PRODUCTION_DEMO_CALLS: "true",
      DIRA_ALLOW_PUBLIC_DEMO_CALLS: "true",
      DIRA_DEMO_CALL_TEST_MODE: "true",
      DIRA_DEMO_CALL_TO: "+15555550101",
      DEMO_CALL_RATE_LIMIT_SECRET: "a-long-test-only-rate-limit-secret-value",
    });

    expect(isProductionDemoVoiceEnabled()).toBe(true);

    process.env.DIRA_ALLOW_PRODUCTION_DEMO_CALLS = "false";
    expect(isProductionDemoVoiceEnabled()).toBe(false);
    process.env.DIRA_ALLOW_PRODUCTION_DEMO_CALLS = "true";

    process.env.DIRA_DEMO_CALL_TEST_MODE = "false";
    expect(isProductionDemoVoiceEnabled()).toBe(false);
    process.env.DIRA_DEMO_CALL_TEST_MODE = "true";

    process.env.DIRA_DEMO_MODE = "false";
    expect(isProductionDemoVoiceEnabled()).toBe(false);
    process.env.DIRA_DEMO_MODE = "true";

    process.env.DIRA_DEMO_CALL_TO = "not-a-number";
    expect(isProductionDemoVoiceEnabled()).toBe(false);
  });

  it("does not report the production opt-in as enabled outside production", () => {
    Object.assign(process.env, {
      NODE_ENV: "development",
      DIRA_DEMO_MODE: "true",
      DIRA_ALLOW_PRODUCTION_DEMO_CALLS: "true",
      DIRA_DEMO_CALL_TEST_MODE: "true",
      DIRA_DEMO_CALL_TO: "+15555550101",
    });

    expect(isProductionDemoVoiceEnabled()).toBe(false);
  });

  it("enables public calls only with both opt-ins and a sufficiently long limiter secret", () => {
    Object.assign(process.env, {
      NODE_ENV: "production",
      DIRA_DEMO_MODE: "true",
      DIRA_ALLOW_PRODUCTION_DEMO_CALLS: "true",
      DIRA_ALLOW_PUBLIC_DEMO_CALLS: "true",
      DIRA_DEMO_CALL_TEST_MODE: "true",
      DEMO_CALL_RATE_LIMIT_SECRET: "a-long-test-only-rate-limit-secret-value",
    });

    expect(isProductionPublicDemoVoiceEnabled()).toBe(true);

    process.env.DEMO_CALL_RATE_LIMIT_SECRET = "short";
    expect(isProductionPublicDemoVoiceEnabled()).toBe(false);
    process.env.DEMO_CALL_RATE_LIMIT_SECRET =
      "a-long-test-only-rate-limit-secret-value";

    process.env.DIRA_ALLOW_PUBLIC_DEMO_CALLS = "false";
    expect(isProductionPublicDemoVoiceEnabled()).toBe(false);
  });
});
