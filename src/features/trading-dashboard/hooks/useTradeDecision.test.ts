import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG, evaluate } from "@/lib/trading";

import { buildEvaluationSnapshot } from "../mapping/buildEvaluationSnapshot";
import { liveMarket, livePricing } from "@/test/test-utils";

describe("useTradeDecision integration", () => {
  it("produces NO TRADE from live-shaped snapshot inputs", () => {
    const snapshot = buildEvaluationSnapshot({
      evaluatedAt: "2026-06-26T23:20:00.000Z",
      noMarket: false,
      market: liveMarket,
      pricing: livePricing,
      btc: {
        price: 64_250.32,
        change24hPercent: 1.8,
        status: "live",
        isUsingFallback: false,
        candles: [{ timestamp: 1, close: 64_250.32 }],
      },
    });

    const decision = evaluate(snapshot, DEFAULT_ENGINE_CONFIG);

    expect(decision.action).toBe("NO TRADE");
    expect(decision.engineVersion).toBeTruthy();
    expect(decision.configHash).toMatch(/^cfg-v1-/);
    expect(decision.reasoning.steps.length).toBeGreaterThan(0);
  });
});
