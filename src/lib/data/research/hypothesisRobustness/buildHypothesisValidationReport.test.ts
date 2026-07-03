import { describe, expect, it } from "vitest";

import { buildHypothesisValidationReport } from "./buildHypothesisValidationReport";
import { serializeHypothesisValidationHtml } from "./serializeHypothesisValidationHtml";
import type { EnrichedMispricingObservation, HypothesisValidationReport } from "./hypothesisRobustnessTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

const GENERATED_AT = "2026-07-02T12:00:00.000Z";

function createCandidate(
  candidateId: string,
  overrides: Partial<HypothesisCandidate> = {},
): HypothesisCandidate {
  return {
    candidateId,
    sourceArtifact: "mispricing-atlas.json",
    hypothesis: "Test hypothesis",
    rationale: "Test rationale",
    marketCondition: "Test condition",
    suggestedStrategyFamily: "calibration-fade",
    requiredData: ["research-output.json"],
    proposedEntryCondition: "Enter when edge exceeds threshold",
    proposedExitSettlementAssumption: "Hold to settlement",
    expectedFailureMode: "Regime shift",
    killCriterion: "Edge disappears",
    confidence: "medium",
    warnings: [],
    ...overrides,
  };
}

function createObservation(
  stepIndex: number,
  overrides: Partial<EnrichedMispricingObservation> = {},
): EnrichedMispricingObservation {
  return {
    strategyId: "strategy-a",
    seriesTicker: "KXBTC15M",
    marketTicker: "KXBTC15M-TEST",
    stepIndex,
    predictedProbability: 0.75,
    observedOutcome: 0,
    timeRemainingMs: 900_000,
    moneynessPercent: 0,
    annualizedVolatility: 0.8,
    timestampMs: 1_700_000_000_000 + stepIndex * 86_400_000,
    tradingDayUtc: stepIndex < 2 ? "2023-10-01" : "2023-11-01",
    calendarMonth: stepIndex < 2 ? "2023-10" : "2023-11",
    calendarQuarter: "2023-Q4",
    volatilityRegime: stepIndex % 3 === 0 ? "low" : stepIndex % 3 === 1 ? "medium" : "high",
    ...overrides,
  };
}

describe("buildHypothesisValidationReport", () => {
  it("validates atlas hypotheses and marks unsupported lead-lag candidates as failing", () => {
    const report = buildHypothesisValidationReport({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/hypothesis-validation.json",
      htmlOutputPath: "data/reports/research-hypothesis-validation.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
        researchResultsDir: "data/research-results",
        regimeTagsPath: "data/research-results/regime-tags.json",
      },
      candidates: [
        createCandidate("atlas-volatility-vol-high-over"),
        createCandidate("lead-lag-btc-spot-over"),
      ],
      observations: [
        createObservation(0),
        createObservation(1),
        createObservation(2),
        createObservation(3),
      ],
      regimeVolatilityByMarket: new Map(),
    });

    const atlasEntry = report.validations.find(
      (entry) => entry.hypothesisId === "atlas-volatility-vol-high-over",
    );
    const leadLagEntry = report.validations.find(
      (entry) => entry.hypothesisId === "lead-lag-btc-spot-over",
    );

    expect(atlasEntry).toBeDefined();
    expect(atlasEntry?.observationCount).toBeGreaterThan(0);
    expect(typeof atlasEntry?.robustnessScore).toBe("number");
    expect(leadLagEntry?.passes).toBe(false);
    expect(leadLagEntry?.robustnessScore).toBe(0);
    expect(report.summary.totalHypotheses).toBe(2);
  });

  it("serializes HTML with score and diagnostics sections", () => {
    const report: HypothesisValidationReport = {
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/hypothesis-validation.json",
      htmlOutputPath: "data/reports/research-hypothesis-validation.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
        researchResultsDir: "data/research-results",
        regimeTagsPath: "data/research-results/regime-tags.json",
      },
      config: {
        passScoreThreshold: 70,
        minCalibrationError: 0.05,
        singleDayConcentrationFlag: 0.5,
        minPeriodObservations: 3,
      },
      summary: {
        totalHypotheses: 1,
        passingCount: 1,
        failingCount: 0,
        averageRobustnessScore: 84,
      },
      validations: [
        {
          hypothesisId: "atlas-volatility-vol-high-over",
          hypothesis: "Markets overprice high-volatility buckets",
          sourceArtifact: "mispricing-atlas.json",
          robustnessScore: 84,
          passes: true,
          reasons: ["Robustness score 84 meets promotion threshold."],
          observationCount: 12,
          timeStability: {
            monthPeriods: [],
            quarterPeriods: [],
            monthPersistenceRate: 0.8,
            quarterPersistenceRate: 0.75,
            scoreComponent: 20,
          },
          regimeStability: {
            regimes: [],
            regimesWithEdge: 2,
            regimesWithData: 3,
            scoreComponent: 18,
          },
          sampleConcentration: {
            uniqueTradingDays: 8,
            largestContributingDay: "2023-11-01",
            largestDayObservations: 2,
            largestDayPercent: 16.7,
            singleDayDominated: false,
            scoreComponent: 22,
          },
          leaveOnePeriodOut: {
            folds: [],
            errorVariance: 0.0001,
            errorStdDev: 0.01,
            scoreComponent: 24,
          },
        },
      ],
    };

    const html = serializeHypothesisValidationHtml(report);

    expect(html).toContain("Hypothesis Robustness Validation");
    expect(html).toContain("Robustness score");
    expect(html).toContain("PASS");
    expect(html).toContain("atlas-volatility-vol-high-over");
    expect(html).toContain("Month persistence");
  });
});
