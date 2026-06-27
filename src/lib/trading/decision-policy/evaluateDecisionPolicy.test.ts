import { describe, expect, it } from "vitest";

import { buildMarketFeatureVector } from "@/lib/features";
import type { FeatureCandle, FeatureExtractionInput } from "@/lib/features/types";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import type { ExpectedValueEstimate } from "@/lib/trading/expected-value/types";
import type { ProbabilityEstimate } from "@/lib/trading/probability/types";
import type { EngineConfig } from "@/types/domain/trading";

import {
  DECISION_POLICY_MODEL_VERSION,
  DEFAULT_DECISION_POLICY_CONFIG,
  evaluateDecisionPolicy,
} from "./evaluateDecisionPolicy";
import { buildDecisionPolicyReasoning } from "./reasoning";

const BASE = 1_700_000_000_000;

function candle(index: number, close: number): FeatureCandle {
  return {
    timestamp: BASE + index * 60_000,
    open: close - 5,
    high: close + 5,
    low: close - 10,
    close,
  };
}

function createFeatureInput(): FeatureExtractionInput {
  return {
    evaluatedAtMs: BASE + 10 * 60_000,
    spotPrice: 64_500,
    candles: Array.from({ length: 12 }, (_, index) => candle(index, 64_000 + index * 40)),
    market: {
      strikePrice: 64_475,
      timeRemainingMs: 600_000,
      closeTime: "2026-06-26T12:15:00.000Z",
    },
    pricing: {
      yesBidCents: 62,
      yesAskCents: 64,
      noBidCents: 36,
      noAskCents: 38,
      volumeDollars: 503_000,
      liquidityQuality: "Good",
    },
  };
}

function mockProbability(
  overrides: Partial<ProbabilityEstimate> = {},
): ProbabilityEstimate {
  return {
    probabilityUp: 0.74,
    probabilityDown: 0.26,
    confidence: 0.8,
    modelVersion: "5.4.0",
    logOdds: 1.05,
    drivers: [],
    ...overrides,
  };
}

function mockExpectedValue(
  overrides: Partial<ExpectedValueEstimate> = {},
): ExpectedValueEstimate {
  return {
    modelVersion: "5.5.0",
    evYesCents: 12,
    evNoCents: -5,
    netEvYesCents: 12,
    netEvNoCents: -5,
    fairYesCents: 74,
    fairNoCents: 26,
    edgeYesPercent: 17.46,
    edgeNoPercent: -13.16,
    bestSide: "yes",
    bestEvCents: 12,
    confidence: 0.75,
    reasoning: { summary: "mock", lines: [] },
    ...overrides,
  };
}

function policyInput(
  overrides: {
    probability?: Partial<ProbabilityEstimate>;
    expectedValue?: Partial<ExpectedValueEstimate>;
    engineConfig?: Partial<EngineConfig>;
  } = {},
) {
  return {
    features: buildMarketFeatureVector(createFeatureInput()),
    probability: mockProbability(overrides.probability),
    expectedValue: mockExpectedValue(overrides.expectedValue),
    engineConfig: { ...DEFAULT_ENGINE_CONFIG, ...overrides.engineConfig },
  };
}

describe("evaluateDecisionPolicy", () => {
  it("returns BUY_UP when YES has sufficient positive edge", () => {
    const result = evaluateDecisionPolicy(policyInput());

    expect(result.action).toBe("BUY_UP");
    expect(result.selectedSide).toBe("yes");
    expect(result.reasonCode).toBe("BUY_UP");
    expect(result.modelVersion).toBe(DECISION_POLICY_MODEL_VERSION);
  });

  it("returns BUY_DOWN when NO has sufficient positive edge", () => {
    const result = evaluateDecisionPolicy(
      policyInput({
        expectedValue: {
          netEvYesCents: -4,
          netEvNoCents: 10,
          edgeYesPercent: -6,
          edgeNoPercent: 27.03,
          bestSide: "no",
          bestEvCents: 10,
        },
      }),
    );

    expect(result.action).toBe("BUY_DOWN");
    expect(result.selectedSide).toBe("no");
    expect(result.reasonCode).toBe("BUY_DOWN");
  });

  it("returns NO_TRADE when edge is too low", () => {
    const result = evaluateDecisionPolicy(
      policyInput({
        expectedValue: {
          netEvYesCents: 2,
          netEvNoCents: -1,
          edgeYesPercent: 3.17,
          edgeNoPercent: -2.7,
          bestSide: "yes",
          bestEvCents: 2,
        },
        engineConfig: { minEdgePercent: 5 },
      }),
    );

    expect(result.action).toBe("NO_TRADE");
    expect(result.selectedSide).toBeNull();
    expect(result.reasonCode).toBe("EDGE_BELOW_THRESHOLD");
  });

  it("returns NO_TRADE when confidence is too low", () => {
    const result = evaluateDecisionPolicy(
      policyInput({
        probability: { confidence: 0.3 },
        expectedValue: { confidence: 0.4 },
      }),
      { ...DEFAULT_DECISION_POLICY_CONFIG, minConfidence: 0.5 },
    );

    expect(result.action).toBe("NO_TRADE");
    expect(result.reasonCode).toBe("CONFIDENCE_BELOW_THRESHOLD");
    expect(result.confidence).toBe(0.3);
  });

  it("returns NO_TRADE when policy is disabled", () => {
    const disabledPolicy = evaluateDecisionPolicy(policyInput(), {
      ...DEFAULT_DECISION_POLICY_CONFIG,
      enabled: false,
    });
    const disabledEngine = evaluateDecisionPolicy(
      policyInput({ engineConfig: { enabled: false } }),
    );

    expect(disabledPolicy.action).toBe("NO_TRADE");
    expect(disabledPolicy.reasonCode).toBe("POLICY_DISABLED");
    expect(disabledEngine.action).toBe("NO_TRADE");
    expect(disabledEngine.reasonCode).toBe("POLICY_DISABLED");
  });

  it("is deterministic for identical inputs", () => {
    const input = policyInput();

    expect(evaluateDecisionPolicy(input)).toEqual(evaluateDecisionPolicy(input));
  });

  it("breaks ties in favor of BUY_UP when both sides qualify", () => {
    const result = evaluateDecisionPolicy(
      policyInput({
        expectedValue: {
          netEvYesCents: 12.5,
          netEvNoCents: 12.5,
          edgeYesPercent: 8,
          edgeNoPercent: 8,
          bestSide: "yes",
          bestEvCents: 12.5,
        },
      }),
    );

    expect(result.action).toBe("BUY_UP");
    expect(result.selectedSide).toBe("yes");
    expect(result.reasonCode).toBe("BUY_UP_TIE_BREAK");
  });

  it("returns NO_TRADE when neither side has positive net EV", () => {
    const result = evaluateDecisionPolicy(
      policyInput({
        expectedValue: {
          netEvYesCents: -3,
          netEvNoCents: -2,
          edgeYesPercent: -4,
          edgeNoPercent: -5,
          bestSide: null,
          bestEvCents: 0,
        },
      }),
    );

    expect(result.action).toBe("NO_TRADE");
    expect(result.reasonCode).toBe("NO_QUALIFYING_SIDE");
  });

  it("keeps reasoning stable for the same result", () => {
    const result = evaluateDecisionPolicy(policyInput());
    const rebuilt = buildDecisionPolicyReasoning({
      action: result.action,
      selectedSide: result.selectedSide,
      reasonCode: result.reasonCode,
      confidence: result.confidence,
      minConfidence: DEFAULT_DECISION_POLICY_CONFIG.minConfidence,
      minEdgePercent: DEFAULT_ENGINE_CONFIG.minEdgePercent,
      edgeYesPercent: 17.46,
      edgeNoPercent: -13.16,
      netEvYesCents: 12,
      netEvNoCents: -5,
      yesQualifies: true,
      noQualifies: false,
    });

    expect(result.reasoning).toEqual(rebuilt);
  });

  it("bounds confidence to [0, 1]", () => {
    const high = evaluateDecisionPolicy(
      policyInput({
        probability: { confidence: 1.5 },
        expectedValue: { confidence: 0.9 },
      }),
    );
    const low = evaluateDecisionPolicy(
      policyInput({
        probability: { confidence: -0.2 },
        expectedValue: { confidence: 0.6 },
      }),
      { ...DEFAULT_DECISION_POLICY_CONFIG, minConfidence: 0 },
    );

    expect(high.confidence).toBe(0.9);
    expect(low.confidence).toBe(0);
  });

  it("handles invalid inputs safely with NO_TRADE", () => {
    const result = evaluateDecisionPolicy(
      policyInput({
        expectedValue: { edgeYesPercent: Number.NaN },
      }),
    );

    expect(result.action).toBe("NO_TRADE");
    expect(result.reasonCode).toBe("INVALID_INPUT");
    expect(result.selectedSide).toBeNull();
  });
});
