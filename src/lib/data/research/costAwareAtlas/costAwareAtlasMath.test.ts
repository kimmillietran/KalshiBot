import { describe, expect, it } from "vitest";

import { DEFAULT_COST_AWARE_ATLAS_CONFIG } from "./costAwareAtlasConfig";
import {
  addObservationToCostAwareBucketState,
  classifySpreadTier,
  classifyTradeability,
  compareBucketEntriesDeterministically,
  compareRankingEntriesDeterministically,
  computeBucketCostMetrics,
  computeExecutionFeeCents,
  computeFadeGrossExpectedValueCents,
  computeHalfSpreadCents,
  computeYesSpreadPercent,
  createCostAwareBucketAccumulatorState,
  observationMatchesSpreadCohort,
  resolveImpliedCalibrationSide,
  resolveQuoteStatus,
} from "./costAwareAtlasMath";

describe("resolveQuoteStatus", () => {
  it("classifies missing, one-sided, invalid, and valid quotes", () => {
    expect(resolveQuoteStatus(null, null)).toBe("missing");
    expect(resolveQuoteStatus(40, null)).toBe("one-sided");
    expect(resolveQuoteStatus(60, 50)).toBe("invalid");
    expect(resolveQuoteStatus(40, 60)).toBe("valid");
  });
});

describe("spread classification", () => {
  const config = DEFAULT_COST_AWARE_ATLAS_CONFIG;

  it("computes yes spread percent and half spread", () => {
    expect(computeYesSpreadPercent(49, 51)).toBeCloseTo(3.921568, 4);
    expect(computeHalfSpreadCents(49, 51)).toBe(1);
  });

  it("classifies tight, medium, and wide spreads deterministically", () => {
    expect(classifySpreadTier(1.5, config)).toBe("tight");
    expect(classifySpreadTier(3, config)).toBe("medium");
    expect(classifySpreadTier(8, config)).toBe("wide");
    expect(classifySpreadTier(null, config)).toBe("unclassified");
  });

  it("handles zero spread as tight", () => {
    expect(computeYesSpreadPercent(50, 50)).toBe(0);
    expect(classifySpreadTier(0, config)).toBe("tight");
  });

  it("maps observations into fillability cohorts", () => {
    const quote = {
      yesBidCents: 48,
      yesAskCents: 52,
      spreadPercent: 7.69,
      quoteStatus: "valid" as const,
    };

    expect(observationMatchesSpreadCohort("all", quote, config)).toBe(true);
    expect(observationMatchesSpreadCohort("validBidAsk", quote, config)).toBe(true);
    expect(observationMatchesSpreadCohort("wideSpread", quote, config)).toBe(true);
    expect(observationMatchesSpreadCohort("tightSpread", quote, config)).toBe(false);
  });
});

describe("fade EV math", () => {
  it("converts signed calibration gap into gross fade EV cents", () => {
    expect(computeFadeGrossExpectedValueCents(0.05)).toBe(5);
    expect(computeFadeGrossExpectedValueCents(-0.03)).toBe(-3);
  });

  it("computes spread- and fee-adjusted bucket metrics", () => {
    const state = createCostAwareBucketAccumulatorState();
    const config = DEFAULT_COST_AWARE_ATLAS_CONFIG;

    addObservationToCostAwareBucketState(state, {
      predictedProbability: 0.6,
      observedOutcome: 0,
      quote: {
        yesBidCents: 58,
        yesAskCents: 62,
        spreadPercent: 6.45,
        quoteStatus: "valid",
      },
      config,
    });
    addObservationToCostAwareBucketState(state, {
      predictedProbability: 0.62,
      observedOutcome: 0,
      quote: {
        yesBidCents: 60,
        yesAskCents: 64,
        spreadPercent: 6.25,
        quoteStatus: "valid",
      },
      config,
    });

    const metrics = computeBucketCostMetrics({ state, config });
    expect(metrics.rawCalibrationGap).toBeCloseTo(0.61, 2);
    expect(metrics.grossExpectedValueCents).toBeCloseTo(61, 0);
    expect(metrics.averageHalfSpreadCents).toBe(2);
    expect(metrics.spreadAdjustedExpectedValueCents).toBeCloseTo(59, 0);
    expect(metrics.averageFeeCents).toBeGreaterThan(0);
    expect(metrics.feeAdjustedExpectedValueCents).toBeLessThan(
      metrics.spreadAdjustedExpectedValueCents!,
    );
    expect(metrics.minimumRequiredEdgeCents).toBeCloseTo(
      metrics.averageHalfSpreadCents! + metrics.averageFeeCents!,
      4,
    );
  });

  it("uses kalshi taker fee schedule for fade execution price", () => {
    const fee = computeExecutionFeeCents({
      feeModel: DEFAULT_COST_AWARE_ATLAS_CONFIG.feeModel,
      calibrationGap: 0.05,
      yesBidCents: 55,
      yesAskCents: 60,
    });

    expect(fee).toBeGreaterThan(0);
  });
});

describe("tradeability classification", () => {
  const config = {
    ...DEFAULT_COST_AWARE_ATLAS_CONFIG,
    minSampleThreshold: 2,
  };

  it("flags underpowered and missing-quote buckets", () => {
    expect(
      classifyTradeability({
        observations: 1,
        validQuoteObservations: 1,
        wideSpreadObservations: 0,
        missingQuoteObservations: 0,
        grossExpectedValueCents: 5,
        feeAdjustedExpectedValueCents: 4,
        config,
      }),
    ).toBe("underpowered");

    expect(
      classifyTradeability({
        observations: 5,
        validQuoteObservations: 0,
        wideSpreadObservations: 0,
        missingQuoteObservations: 5,
        grossExpectedValueCents: 5,
        feeAdjustedExpectedValueCents: null,
        config,
      }),
    ).toBe("untradeable-missing-quotes");
  });

  it("classifies gross-only and tradeable-positive buckets", () => {
    expect(
      classifyTradeability({
        observations: 10,
        validQuoteObservations: 10,
        wideSpreadObservations: 1,
        missingQuoteObservations: 0,
        grossExpectedValueCents: 4,
        feeAdjustedExpectedValueCents: -0.5,
        config,
      }),
    ).toBe("gross-only");

    expect(
      classifyTradeability({
        observations: 10,
        validQuoteObservations: 10,
        wideSpreadObservations: 1,
        missingQuoteObservations: 0,
        grossExpectedValueCents: 8,
        feeAdjustedExpectedValueCents: 2,
        config,
      }),
    ).toBe("tradeable-positive");
  });
});

describe("deterministic ordering", () => {
  it("sorts buckets and rankings deterministically", () => {
    expect(
      compareBucketEntriesDeterministically(
        { dimension: "probability", bucketId: "b" },
        { dimension: "probability", bucketId: "a" },
      ),
    ).toBeGreaterThan(0);

    expect(
      compareRankingEntriesDeterministically(
        { valueCents: 5, dimension: "probability", bucketId: "a" },
        { valueCents: 3, dimension: "probability", bucketId: "b" },
        "desc",
      ),
    ).toBeLessThan(0);
  });
});

describe("edge cases", () => {
  it("handles empty bucket metrics", () => {
    const metrics = computeBucketCostMetrics({
      state: createCostAwareBucketAccumulatorState(),
      config: DEFAULT_COST_AWARE_ATLAS_CONFIG,
    });

    expect(metrics.rawCalibrationGap).toBeNull();
    expect(metrics.grossExpectedValueCents).toBeNull();
    expect(resolveImpliedCalibrationSide(null, 0.001)).toBe("neutral");
  });

  it("handles invalid prices without throwing", () => {
    const state = createCostAwareBucketAccumulatorState();
    addObservationToCostAwareBucketState(state, {
      predictedProbability: null,
      observedOutcome: 1,
      quote: {
        yesBidCents: null,
        yesAskCents: null,
        spreadPercent: null,
        quoteStatus: "missing",
      },
      config: DEFAULT_COST_AWARE_ATLAS_CONFIG,
    });

    expect(state.observations).toBe(1);
    expect(state.validQuoteObservations).toBe(0);
  });
});
