import { describe, expect, it } from "vitest";

import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import { buildCoverageImportRecommendations } from "./buildCoverageImportRecommendations";
import { buildTemporalBalanceDiagnostics } from "./buildTemporalBalanceDiagnostics";
import { computeCoverageSnapshot } from "./computeCoverageSnapshot";

const GENERATED_AT = "2026-07-05T12:00:00.000Z";

function createValidation(input: {
  hypothesisId: string;
  hypothesis: string;
  robustnessScore: number;
  monthPeriods: Array<{ month: string; observations: number }>;
  monthPersistenceRate?: number;
  passes?: boolean;
}): HypothesisValidationEntry {
  return {
    hypothesisId: input.hypothesisId,
    hypothesis: input.hypothesis,
    sourceArtifact: "mispricing-atlas.json",
    robustnessScore: input.robustnessScore,
    passes: input.passes ?? false,
    reasons: [],
    observationCount: input.monthPeriods.reduce(
      (total, period) => total + period.observations,
      0,
    ),
    timeStability: {
      monthPeriods: input.monthPeriods.map((period) => ({
        periodKey: period.month,
        observations: period.observations,
        signedCalibrationError: 0.1,
        edgeMatchesDirection: true,
      })),
      quarterPeriods: [],
      monthPersistenceRate: input.monthPersistenceRate ?? 0.5,
      quarterPersistenceRate: 0.5,
      scoreComponent: 0,
    },
    regimeStability: {
      regimes: [],
      regimesWithEdge: 1,
      regimesWithData: 3,
      scoreComponent: 0,
    },
    sampleConcentration: {
      uniqueTradingDays: 37,
      largestContributingDay: "2026-01-15",
      largestDayObservations: 40,
      largestDayPercent: 0.4,
      singleDayDominated: true,
      scoreComponent: 0,
    },
    leaveOnePeriodOut: {
      folds: input.monthPeriods.map((period) => ({
        excludedMonth: period.month,
        remainingObservations:
          input.monthPeriods.reduce((total, entry) => total + entry.observations, 0)
          - period.observations,
        signedCalibrationError: 0.08,
      })),
      errorVariance: 0.0001,
      errorStdDev: 0.009,
      scoreComponent: 0,
    },
  };
}

function createUnevenHypothesisValidation(): HypothesisValidationEntry {
  return createValidation({
    hypothesisId: "hyp-high-vol-overconfident",
    hypothesis: "High volatility × [0.3, 0.7) × <15 min remaining overconfident",
    robustnessScore: 61,
    monthPersistenceRate: 0.4,
    monthPeriods: [
      { month: "2026-01", observations: 90 },
      { month: "2026-02", observations: 85 },
      { month: "2026-03", observations: 1 },
      { month: "2026-04", observations: 23 },
      { month: "2026-05", observations: 2 },
    ],
  });
}

describe("buildTemporalBalanceDiagnostics", () => {
  it("reports per-month diagnostics and thin months for promising hypotheses", () => {
    const snapshot = computeCoverageSnapshot(
      [
        {
          seriesTicker: "KXBTC15M",
          marketTicker: "MKT-JAN",
          source: "import-config",
          calendarMonths: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"],
          tradingDays: ["2026-01-10", "2026-02-10", "2026-03-01", "2026-04-10", "2026-05-02"],
          volatilityRegime: "high",
        },
      ],
      { importConfigCount: 1, fixtureCount: 0, researchOutputCount: 1 },
      { minMarketsPerMonth: 1, minTradingDaysPerMonth: 1 },
    );

    const diagnostics = buildTemporalBalanceDiagnostics({
      snapshot,
      artifacts: {
        dataHealth: null,
        mispricingAtlas: null,
        regimeTags: null,
        hypothesisValidation: {
          generatedAt: GENERATED_AT,
          validations: [createUnevenHypothesisValidation()],
        } as never,
      },
      monthPersistenceThreshold: 0.67,
    });

    expect(diagnostics.unevenHypothesisCount).toBe(1);
    expect(diagnostics.thinMonthCount).toBe(2);
    expect(diagnostics.monthDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          month: "2026-03",
          marketCount: 1,
          researchObservationCount: 1,
          qualifyingHypothesisObservationCount: 1,
        }),
        expect.objectContaining({
          month: "2026-04",
          researchObservationCount: 23,
        }),
      ]),
    );

    const hypothesis = diagnostics.hypothesisBalances[0];
    expect(hypothesis?.thinMonths).toEqual(["2026-03", "2026-05"]);
    expect(hypothesis?.weakestMonths[0]).toBe("2026-03");
    expect(hypothesis?.validationBenefit.improvesMonthPersistence).toBe(true);
    expect(hypothesis?.validationBenefit.improvesSampleConcentration).toBe(true);
  });
});

describe("buildCoverageImportRecommendations temporal balance", () => {
  it("prioritizes temporal-balance-import windows for thin promising-hypothesis months", () => {
    const snapshot = computeCoverageSnapshot(
      [
        {
          seriesTicker: "KXBTC15M",
          marketTicker: "MKT-APR",
          source: "import-config",
          calendarMonths: ["2026-04"],
          tradingDays: ["2026-04-10"],
          volatilityRegime: "high",
        },
      ],
      { importConfigCount: 1, fixtureCount: 0, researchOutputCount: 1 },
      { minMarketsPerMonth: 1, minTradingDaysPerMonth: 1 },
    );

    const temporalBalance = buildTemporalBalanceDiagnostics({
      snapshot,
      artifacts: {
        dataHealth: null,
        mispricingAtlas: null,
        regimeTags: null,
        hypothesisValidation: {
          generatedAt: GENERATED_AT,
          validations: [createUnevenHypothesisValidation()],
        } as never,
      },
      monthPersistenceThreshold: 0.67,
    });

    const recommendations = buildCoverageImportRecommendations(
      snapshot,
      {
        dataHealth: null,
        mispricingAtlas: null,
        regimeTags: null,
        hypothesisValidation: {
          generatedAt: GENERATED_AT,
          validations: [createUnevenHypothesisValidation()],
        } as never,
      },
      {
        monthPersistenceThreshold: 0.67,
        minMarketsPerMonth: 1,
        minTradingDaysPerMonth: 1,
      },
      [],
      temporalBalance,
    );

    const temporalRecommendations = recommendations.filter(
      (entry) => entry.recommendationType === "temporal-balance-import",
    );

    expect(temporalRecommendations.length).toBeGreaterThanOrEqual(2);
    expect(temporalRecommendations[0]?.targetHypothesisIds).toContain("hyp-high-vol-overconfident");
    expect(temporalRecommendations[0]?.rationale).toContain("Temporal-balance import");
    expect(
      temporalRecommendations.flatMap((entry) => [...entry.missingMonths]),
    ).toEqual(expect.arrayContaining(["2026-03", "2026-05"]));
    expect(recommendations[0]?.recommendationType).toBe("temporal-balance-import");
  });
});
