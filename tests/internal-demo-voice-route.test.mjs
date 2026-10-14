import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
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

const { POST } = await import("../app/api/internal/demo-voice/route.ts");

const envKeys = [
  "NODE_ENV",
  "DIRA_DEMO_MODE",
  "DIRA_ALLOW_PRODUCTION_DEMO_CALLS",
  "DIRA_DEMO_CALL_TEST_MODE",
  "DIRA_DEMO_CALL_TO",
  "FOLLOW_UP_SCHEDULER_SECRET",
];
let originalEnv;

beforeEach(() => {
  originalEnv = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, {
    NODE_ENV: "production",
    DIRA_DEMO_MODE: "true",
    DIRA_ALLOW_PRODUCTION_DEMO_CALLS: "true",
    DIRA_DEMO_CALL_TEST_MODE: "true",
    DIRA_DEMO_CALL_TO: "+15555550101",
    FOLLOW_UP_SCHEDULER_SECRET: "test-operator-secret",
  });
  dependencies.resolveTeacherContext.mockClear();
  dependencies.queueManualDemoFollowUp.mockClear();
  dependencies.dispatchOneDueFollowUp.mockClear();
});

afterEach(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function request(authorization) {
  return new Request("https://dira.example/api/internal/demo-voice", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

describe("operator-only production demo voice route", () => {
  it("rejects missing or incorrect operator secrets before queueing a call", async () => {
    const missing = await POST(request());
    const incorrect = await POST(request("Bearer incorrect"));

    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(dependencies.queueManualDemoFollowUp).not.toHaveBeenCalled();
    expect(dependencies.dispatchOneDueFollowUp).not.toHaveBeenCalled();
  });

  it("queues and dispatches one call only after the operator secret is valid", async () => {
    const response = await POST(request("Bearer test-operator-secret"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "provider_accepted",
      is_demo: true,
      already_queued: false,
    });
    expect(dependencies.queueManualDemoFollowUp).toHaveBeenCalledWith({
      teacher_id: "DEMO_T1",
      school_id: "DEMO_S1",
    });
    expect(dependencies.dispatchOneDueFollowUp).toHaveBeenCalledWith(
      expect.any(Date),
      { teacher_id: "DEMO_T1", school_id: "DEMO_S1" },
      "11111111-1111-4111-8111-111111111111",
      { operatorAuthorized: true },
    );
  });

  it("keeps the endpoint disabled unless the production demo gate is enabled", async () => {
    process.env.DIRA_ALLOW_PRODUCTION_DEMO_CALLS = "false";

    const response = await POST(request("Bearer test-operator-secret"));

    expect(response.status).toBe(503);
    expect(dependencies.queueManualDemoFollowUp).not.toHaveBeenCalled();
    expect(dependencies.dispatchOneDueFollowUp).not.toHaveBeenCalled();
  });
});
