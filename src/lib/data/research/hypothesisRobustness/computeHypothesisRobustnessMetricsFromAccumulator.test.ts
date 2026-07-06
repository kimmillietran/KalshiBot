import { describe, expect, it } from "vitest";

import { buildHypothesisValidationReport, validateCandidate } from "./buildHypothesisValidationReport";
import { validateCandidateFromAccumulator } from "./computeHypothesisRobustnessMetricsFromAccumulator";
import { filterObservationsForAtlasBucket } from "./filterObservationsForAtlasBucket";
import { parseAtlasHypothesisCandidateId } from "./parseAtlasHypothesisCandidateId";
import type { EnrichedMispricingObservation } from "./hypothesisRobustnessTypes";
import {
  createValidationBucketAccumulator,
  recordValidationObservation,
} from "./validationBucketAccumulator";

const CONFIG = {
  passScoreThreshold: 70,
  minCalibrationError: 0.05,
  singleDayConcentrationFlag: 0.5,
  minPeriodObservations: 3,
};

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
    tradingDayUtc: stepIndex < 3 ? "2023-10-01" : "2023-11-01",
    calendarMonth: stepIndex < 3 ? "2023-10" : "2023-11",
    calendarQuarter: "2023-Q4",
    volatilityRegime: stepIndex % 3 === 0 ? "low" : stepIndex % 3 === 1 ? "medium" : "high",
    ...overrides,
  };
}

describe("validateCandidateFromAccumulator", () => {
  it("matches legacy observation-based validation metrics", () => {
    const candidateId = "atlas-volatility-vol-high-over";
    const atlasRef = parseAtlasHypothesisCandidateId(candidateId);
    expect(atlasRef).not.toBeNull();

    const observations = Array.from({ length: 8 }, (_, index) =>
      createObservation(index, {
        annualizedVolatility: 0.85,
        predictedProbability: 0.8,
        observedOutcome: index % 2 === 0 ? 0 : 1,
      }),
    );

    const candidate = {
      candidateId,
      sourceArtifact: "mispricing-atlas.json",
      hypothesis: "High volatility overpricing",
      rationale: "Test",
      marketCondition: "High vol",
      suggestedStrategyFamily: "calibration-fade",
      requiredData: [],
      proposedEntryCondition: "edge",
      proposedExitSettlementAssumption: "settlement",
      expectedFailureMode: "regime",
      killCriterion: "edge gone",
      confidence: "medium" as const,
      warnings: [],
    };

    const legacyEntry = validateCandidate(
      candidate,
      observations,
      new Map(),
      CONFIG,
    );

    const accumulator = createValidationBucketAccumulator(atlasRef!);
    const bucketObservations = filterObservationsForAtlasBucket(
      observations,
      atlasRef!,
      new Map(),
    );

    for (const observation of bucketObservations) {
      recordValidationObservation(accumulator, observation);
    }

    const aggregateResult = validateCandidateFromAccumulator({
      candidate,
      atlasRef,
      accumulator,
      config: CONFIG,
    });

    expect(aggregateResult.observationCount).toBe(legacyEntry.observationCount);
    expect(aggregateResult.robustnessScore).toBe(legacyEntry.robustnessScore);
    expect(aggregateResult.passes).toBe(legacyEntry.passes);
    expect(aggregateResult.timeStability).toEqual(legacyEntry.timeStability);
    expect(aggregateResult.regimeStability).toEqual(legacyEntry.regimeStability);
    expect(aggregateResult.sampleConcentration).toEqual(legacyEntry.sampleConcentration);
    expect(aggregateResult.leaveOnePeriodOut).toEqual(legacyEntry.leaveOnePeriodOut);
  });

  it("buildHypothesisValidationReport still validates direct observation input", () => {
    const report = buildHypothesisValidationReport({
      generatedAt: "2026-07-02T12:00:00.000Z",
      outputPath: "data/research-results/hypothesis-validation.json",
      htmlOutputPath: "data/reports/research-hypothesis-validation.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
        researchResultsDir: "data/research-results",
        regimeTagsPath: "data/research-results/regime-tags.json",
      },
      candidates: [
        {
          candidateId: "atlas-volatility-vol-high-over",
          sourceArtifact: "mispricing-atlas.json",
          hypothesis: "Test",
          rationale: "Test",
          marketCondition: "Test",
          suggestedStrategyFamily: "calibration-fade",
          requiredData: [],
          proposedEntryCondition: "edge",
          proposedExitSettlementAssumption: "settlement",
          expectedFailureMode: "regime",
          killCriterion: "edge gone",
          confidence: "medium",
          warnings: [],
        },
      ],
      observations: [createObservation(0, { annualizedVolatility: 0.85 })],
      regimeVolatilityByMarket: new Map(),
    });

    expect(report.validations[0]?.observationCount).toBeGreaterThan(0);
  });
});
