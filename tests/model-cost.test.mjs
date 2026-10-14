import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { calculateModelCost } from "../lib/agent/model-cost.ts";

describe("model usage cost calculation", () => {
  it("applies separate input, cached-input, and output rates", () => {
    expect(calculateModelCost("glm-5.3-flash", {
      inputTokens: 1_000_000,
      cachedInputTokens: 500_000,
      outputTokens: 100_000,
    })).toMatchObject({
      costUsd: 0.14,
      costStatus: "calculated",
      pricingObservedOn: "2026-10-14",
    });
  });

  it("marks missing usage and unknown model rates as unpriced", () => {
    expect(calculateModelCost("glm-5.3-flash", null)).toMatchObject({
      costUsd: null,
      costStatus: "unknown",
      pricingSource: expect.any(String),
    });
    expect(calculateModelCost("unconfigured-model", {
      inputTokens: 1,
      cachedInputTokens: 0,
      outputTokens: 1,
    })).toMatchObject({
      costUsd: null,
      costStatus: "unknown",
      pricingSource: null,
    });
  });
});
