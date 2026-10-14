import type { ModelUsage } from "@/lib/models";

const PRICING_OBSERVED_ON = "2026-10-14";
const PRICING_SOURCE = "https://docs.z.ai/guides/overview/pricing";
const PRICING_VERSION = "zai-pricing-2026-10-14";
const TOKENS_PER_MILLION = 1_000_000;

const MODEL_RATES: Record<
  string,
  {
    inputUsdPerMillion: number;
    cachedInputUsdPerMillion: number;
    outputUsdPerMillion: number;
  }
> = {
  "glm-5.3-flash": {
    inputUsdPerMillion: 0.15,
    cachedInputUsdPerMillion: 0.03,
    outputUsdPerMillion: 0.5,
  },
};

export interface ModelCost {
  costUsd: number | null;
  costStatus: "calculated" | "unknown";
  pricingSource: string | null;
  pricingObservedOn: string | null;
  pricingVersion: string | null;
}

export function calculateModelCost(
  model: string,
  usage: ModelUsage | null,
): ModelCost {
  const rates = MODEL_RATES[model.toLowerCase()];
  if (!rates || !usage) {
    return {
      costUsd: null,
      costStatus: "unknown",
      pricingSource: rates ? PRICING_SOURCE : null,
      pricingObservedOn: rates ? PRICING_OBSERVED_ON : null,
      pricingVersion: rates ? PRICING_VERSION : null,
    };
  }

  const nonCachedInputTokens = usage.inputTokens - usage.cachedInputTokens;
  const cost =
    (nonCachedInputTokens * rates.inputUsdPerMillion +
      usage.cachedInputTokens * rates.cachedInputUsdPerMillion +
      usage.outputTokens * rates.outputUsdPerMillion) /
    TOKENS_PER_MILLION;

  return {
    costUsd: Number(cost.toFixed(8)),
    costStatus: "calculated",
    pricingSource: PRICING_SOURCE,
    pricingObservedOn: PRICING_OBSERVED_ON,
    pricingVersion: PRICING_VERSION,
  };
}
