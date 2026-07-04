import { describe, expect, it } from "vitest";

import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { EnrichedMispricingObservation } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import { buildCrossValidationReport } from "./buildCrossValidationReport";
import { CROSS_VALIDATION_METHOD_IDS } from "./crossValidationTypes";
import { serializeCrossValidationHtml } from "./serializeCrossValidationHtml";

const GENERATED_AT = "2026-07-03T12:00:00.000Z";

function createCandidate(candidateId: string): HypothesisCandidate {
  return {
    candidateId,
    sourceArtifact: "mispricing-atlas.json",
    hypothesis: "High-vol markets are overpriced",
    rationale: "Calibration drift",
    marketCondition: "High volatility",
    suggestedStrategyFamily: "calibration-fade",
    requiredData: ["research-output.json"],
    proposedEntryCondition: "Fade overpriced side",
    proposedExitSettlementAssumption: "Hold to settlement",
    expectedFailureMode: "Regime shift",
    killCriterion: "Edge disappears",
    confidence: "medium",
    warnings: [],
  };
}

function createObservation(stepIndex: number): EnrichedMispricingObservation {
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
    tradingDayUtc: stepIndex < 3 ? "2023-10-01" : "2023-11-01",
    calendarMonth: stepIndex < 3 ? "2023-10" : "2023-11",
    calendarQuarter: "2023-Q4",
    volatilityRegime: stepIndex % 3 === 0 ? "low" : stepIndex % 3 === 1 ? "medium" : "high",
  };
}

describe("buildCrossValidationReport", () => {
  it("builds cross-validation entries for hypotheses and synthesized strategies", () => {
    const report = buildCrossValidationReport({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/cross-validation.json",
      htmlOutputPath: "data/reports/research-cross-validation.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        strategySynthesisPath: "data/research-results/strategy-synthesis-candidates.json",
        researchResultsDir: "data/research-results",
        regimeTagsPath: "data/research-results/regime-tags.json",
      },
      candidates: [createCandidate("atlas-volatility-vol-high-over")],
      synthesizedStrategies: [
        {
          strategyId: "synth-calibration-fade-vol-high",
          hypothesisId: "atlas-volatility-vol-high-over",
          strategyFamily: "calibration-fade",
        },
      ],
      hypothesisValidations: [
        {
          hypothesisId: "atlas-volatility-vol-high-over",
          robustnessScore: 78,
          passes: true,
          leaveOnePeriodOutStdDev: 0.03,
        },
      ],
      observations: Array.from({ length: 6 }, (_, index) => createObservation(index)),
      regimeVolatilityByMarket: new Map(),
      config: {
        bootstrapIterations: 10,
        minPeriodObservations: 2,
        maxErrorStdDev: 0.5,
        minPersistenceRate: 0.3,
      },
    });

    expect(report.summary.totalTargets).toBe(2);
    expect(report.summary.hypothesisCount).toBe(1);
    expect(report.summary.synthesizedStrategyCount).toBe(1);

    const hypothesisEntry = report.entries.find(
      (entry) => entry.targetId === "atlas-volatility-vol-high-over",
    );
    expect(hypothesisEntry?.hypothesisValidationReference).toEqual({
      robustnessScore: 78,
      passes: true,
      leaveOnePeriodOutStdDev: 0.03,
    });

    for (const methodId of CROSS_VALIDATION_METHOD_IDS) {
      expect(hypothesisEntry?.methods[methodId].observationCount).toBe(6);
      expect(hypothesisEntry?.methods[methodId].stabilityMetrics.totalFoldCount).toBeGreaterThan(0);
    }

    const html = serializeCrossValidationHtml(report);
    expect(html).toContain("Research Cross-Validation");
    expect(html).toContain("atlas-volatility-vol-high-over");
    expect(html).toContain("synth-calibration-fade-vol-high");
  });

  it("degrades gracefully when no inputs are present", () => {
    const report = buildCrossValidationReport({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/cross-validation.json",
      htmlOutputPath: "data/reports/research-cross-validation.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        strategySynthesisPath: "data/research-results/strategy-synthesis-candidates.json",
        researchResultsDir: "data/research-results",
        regimeTagsPath: "data/research-results/regime-tags.json",
      },
      candidates: [],
      synthesizedStrategies: [],
      hypothesisValidations: [],
      observations: [],
      regimeVolatilityByMarket: new Map(),
    });

    expect(report.summary.totalTargets).toBe(0);
    expect(report.entries).toEqual([]);
  });
});
