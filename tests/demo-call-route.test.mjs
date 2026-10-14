import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const dependencies = vi.hoisted(() => ({
  PublicDemoCallLimitError: class PublicDemoCallLimitError extends Error {
    constructor(limit) {
      super("The demo call limit has been reached");
      this.name = "PublicDemoCallLimitError";
      this.limit = limit;
    }
  },
  resolveTeacherContext: vi.fn(async () => ({
    teacher_id: "DEMO_T1",
    school_id: "DEMO_S1",
  })),
  queueManualDemoFollowUp: vi.fn(async () => ({
    follow_up_job_id: "11111111-1111-4111-8111-111111111111",
    scheduled_end_at: new Date(),
    already_queued: false,
  })),
  dispatchOneDueFollowUp: vi.fn(async () => ({
    follow_up_job_id: "11111111-1111-4111-8111-111111111111",
    status: "provider_accepted",
    is_demo: true,
  })),
  reservePublicDemoCall: vi.fn(async () => "22222222-2222-4222-8222-222222222222"),
  completePublicDemoCallReservation: vi.fn(async () => undefined),
}));

vi.mock("../lib/auth/teacher-context.ts", () => ({
  resolveTeacherContext: dependencies.resolveTeacherContext,
}));
vi.mock("../lib/services/follow-up-queue.ts", () => ({
  queueManualDemoFollowUp: dependencies.queueManualDemoFollowUp,
}));
vi.mock("../lib/services/follow-up-dispatch.ts", () => ({
  dispatchOneDueFollowUp: dependencies.dispatchOneDueFollowUp,
}));
vi.mock("../lib/services/public-demo-voice.ts", async (importOriginal) => {
  return {
    PublicDemoCallLimitError: dependencies.PublicDemoCallLimitError,
    reservePublicDemoCall: dependencies.reservePublicDemoCall,
    completePublicDemoCallReservation:
      dependencies.completePublicDemoCallReservation,
  };
});

const { POST } = await import("../app/api/demo-call/route.ts");

const envKeys = [
  "NODE_ENV",
  "DIRA_DEMO_MODE",
  "DIRA_ALLOW_PRODUCTION_DEMO_CALLS",
  "DIRA_ALLOW_PUBLIC_DEMO_CALLS",
  "DIRA_DEMO_CALL_TEST_MODE",
  "DEMO_CALL_RATE_LIMIT_SECRET",
];
let originalEnv;

beforeEach(() => {
  originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    NODE_ENV: "production",
    DIRA_DEMO_MODE: "true",
    DIRA_ALLOW_PRODUCTION_DEMO_CALLS: "true",
    DIRA_ALLOW_PUBLIC_DEMO_CALLS: "true",
    DIRA_DEMO_CALL_TEST_MODE: "true",
    DEMO_CALL_RATE_LIMIT_SECRET: "a-long-test-only-rate-limit-secret-value",
  });
  for (const dependency of [
    dependencies.resolveTeacherContext,
    dependencies.queueManualDemoFollowUp,
    dependencies.dispatchOneDueFollowUp,
    dependencies.reservePublicDemoCall,
    dependencies.completePublicDemoCallReservation,
  ]) {
    dependency.mockClear();
  }
});

afterEach(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function request(body, origin = "https://dira.example") {
  return new NextRequest("https://dira.example/api/demo-call", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("on-demand demo call route", () => {
  it("rejects invalid number or missing consent before reserving a call", async () => {
    const invalidPhone = await POST(
      request({ phoneNumber: "0712345678", consent: true }),
    );
    const missingConsent = await POST(
      request({ phoneNumber: "+254712345678", consent: false }),
    );

    expect(invalidPhone.status).toBe(400);
    expect(missingConsent.status).toBe(400);
    expect(dependencies.reservePublicDemoCall).not.toHaveBeenCalled();
    expect(dependencies.dispatchOneDueFollowUp).not.toHaveBeenCalled();
  });

  it("requires a same-origin HTTPS request", async () => {
    const response = await POST(
      request(
        { phoneNumber: "+254712345678", consent: true },
        "https://attacker.example",
      ),
    );

    expect(response.status).toBe(403);
    expect(dependencies.reservePublicDemoCall).not.toHaveBeenCalled();
  });

  it("dispatches to the submitted number only after consent and rate reservation", async () => {
    const response = await POST(
      request({ phoneNumber: "+254712345678", consent: true }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "provider_accepted",
      is_demo: true,
    });
    expect(dependencies.reservePublicDemoCall).toHaveBeenCalledWith(
      "+254712345678",
    );
    expect(dependencies.dispatchOneDueFollowUp).toHaveBeenCalledWith(
      expect.any(Date),
      { teacher_id: "DEMO_T1", school_id: "DEMO_S1" },
      "11111111-1111-4111-8111-111111111111",
      {
        publicDemoCallAuthorized: true,
        destinationOverride: "+254712345678",
      },
    );
    expect(dependencies.completePublicDemoCallReservation).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      true,
    );
  });

  it("does not call when the database rate limit rejects the request", async () => {
    dependencies.reservePublicDemoCall.mockRejectedValueOnce(
      new dependencies.PublicDemoCallLimitError("number"),
    );

    const response = await POST(
      request({ phoneNumber: "+254712345678", consent: true }),
    );

    expect(response.status).toBe(429);
    expect(dependencies.queueManualDemoFollowUp).not.toHaveBeenCalled();
    expect(dependencies.dispatchOneDueFollowUp).not.toHaveBeenCalled();
  });
});
