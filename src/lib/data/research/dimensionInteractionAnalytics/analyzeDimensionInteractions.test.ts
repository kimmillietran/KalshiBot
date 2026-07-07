import { describe, expect, it } from "vitest";

import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import {
  analyzeDimensionInteractions,
  defaultAnalyzeConfig,
  listCompositeResearchAxisGroups,
  rankDimensionInteractions,
} from "./analyzeDimensionInteractions";

function validationEntry(
  hypothesisId: string,
  robustnessScore: number,
  passes: boolean,
): HypothesisValidationEntry {
  return {
    hypothesisId,
    hypothesis: hypothesisId,
    sourceArtifact: "hypothesis-validation.json",
    robustnessScore,
    passes,
    reasons: [],
    observationCount: 20,
    timeStability: {
      monthPeriods: [],
      quarterPeriods: [],
      monthPersistenceRate: 0.5,
      quarterPersistenceRate: 0.5,
    },
    regimeStability: {
      regimes: [],
      regimesWithEdge: 0,
      regimesWithData: 0,
    },
    sampleConcentration: {
      uniqueTradingDays: 10,
      largestContributingDay: null,
      largestDayObservations: 0,
      largestDayPercent: 0,
      singleDayDominated: false,
    },
    leaveOnePeriodOut: {
      folds: [],
      errorVariance: 0,
      errorStdDev: 0,
    },
  };
}

function candidate(
  candidateId: string,
  calibrationError = 0.08,
): HypothesisCandidate {
  return {
    candidateId,
    sourceArtifact: "hypothesis-candidates.json",
    hypothesis: candidateId,
    rationale: "test",
    marketCondition: "test",
    suggestedStrategyFamily: "test",
    requiredData: [],
    proposedEntryCondition: "test",
    proposedExitSettlementAssumption: "test",
    expectedFailureMode: "test",
    killCriterion: "test",
    confidence: "medium",
    warnings: [],
    bucketMetadata: {
      groupId: "probabilityMomentum",
      bucketId: "prob-70-80-mom-up",
      bucketLabel: "70-80% up momentum",
      observations: 20,
      uniqueTradingDays: 8,
      calibrationError,
      calibrationDirection: "over",
    },
  };
}

describe("analyzeDimensionInteractions", () => {
  const defaults = defaultAnalyzeConfig();

  it("lists composite axis groups including probability × momentum", () => {
    const groupIds = listCompositeResearchAxisGroups().map((group) => group.groupId);

    expect(groupIds).toContain("probabilityMomentum");
    expect(groupIds).toContain("probabilityHour");
    expect(groupIds).toContain("momentumVolatility");
    expect(groupIds).toContain("probabilityTime");
  });

  it("returns stable metrics for empty inputs", () => {
    const interactions = analyzeDimensionInteractions({
      candidates: [],
      validations: [],
      atlas: null,
      priorityByHypothesisId: new Map(),
      ...defaults,
    });

    expect(interactions.length).toBeGreaterThan(0);
    expect(interactions.every((entry) => entry.candidateCount === 0)).toBe(true);
    expect(interactions.every((entry) => entry.interactionScore >= 0)).toBe(true);
  });

  it("aggregates candidates and validation by composite group", () => {
    const candidateId = "atlas-probabilityMomentum-prob-70-80-mom-up-over";
    const interactions = analyzeDimensionInteractions({
      candidates: [candidate(candidateId, 0.1)],
      validations: [validationEntry(candidateId, 62, false)],
      atlas: null,
      priorityByHypothesisId: new Map([[candidateId, "near-promising"]]),
      ...defaults,
    });

    const probabilityMomentum = interactions.find(
      (entry) => entry.groupId === "probabilityMomentum",
    );

    expect(probabilityMomentum?.candidateCount).toBe(1);
    expect(probabilityMomentum?.validatedCount).toBe(1);
    expect(probabilityMomentum?.passRate).toBe(0);
    expect(probabilityMomentum?.nearPromisingFrequency).toBe(1);
    expect(probabilityMomentum?.averageCalibrationError).toBe(0.1);
  });

  it("produces deterministic rankings", () => {
    const interactions = analyzeDimensionInteractions({
      candidates: [
        candidate("atlas-probabilityMomentum-prob-70-80-mom-up-over", 0.12),
        candidate("atlas-probabilityHour-prob-70-80-hour-14-over", 0.04),
      ],
      validations: [
        validationEntry("atlas-probabilityMomentum-prob-70-80-mom-up-over", 72, true),
        validationEntry("atlas-probabilityHour-prob-70-80-hour-14-over", 40, false),
      ],
      atlas: null,
      priorityByHypothesisId: new Map(),
      ...defaults,
    });

    const first = rankDimensionInteractions(interactions);
    const second = rankDimensionInteractions(interactions);

    expect(first).toEqual(second);
    expect(first.bestInteractions[0]).toBeDefined();
    expect(first.weakestInteractions.at(-1)).toBeDefined();
  });
});
