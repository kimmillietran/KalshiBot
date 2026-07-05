import type { CoverageAwareValidationClassification } from "@/lib/data/research/coverageAwareValidation/coverageAwareValidationTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import type { LoadedHypothesisEvolutionInputs } from "./loadHypothesisEvolutionInputs";
import type {
  HypothesisEvolutionRunSnapshot,
  HypothesisEvolutionValidationEntry,
  HypothesisHistoryRun,
} from "./hypothesisEvolutionTypes";

function isPromotionEligible(
  classification: CoverageAwareValidationClassification | null,
  passes: boolean,
  robustnessScore: number,
): boolean {
  if (classification === "robust-enough-to-test") {
    return true;
  }

  return passes && robustnessScore >= 70;
}

function buildCandidateRankByHypothesisId(
  validations: readonly HypothesisEvolutionValidationEntry[],
): Map<string, number> {
  const sorted = [...validations].sort((left, right) => {
    const scoreCompare = right.robustnessScore - left.robustnessScore;
    if (scoreCompare !== 0) {
      return scoreCompare;
    }

    return left.hypothesisId.localeCompare(right.hypothesisId);
  });

  const ranks = new Map<string, number>();
  sorted.forEach((validation, index) => {
    ranks.set(validation.hypothesisId, index + 1);
  });

  return ranks;
}

function buildSnapshot(input: {
  timestamp: string;
  marketCount: number;
  validation: HypothesisEvolutionValidationEntry;
  candidate: HypothesisCandidate | undefined;
  classification: CoverageAwareValidationClassification | null;
  candidateRank: number | null;
}): HypothesisEvolutionRunSnapshot {
  const monthCount = input.validation.timeStability.monthPeriods.filter(
    (period) => period.observations > 0,
  ).length;

  return {
    timestamp: input.timestamp,
    hypothesis: input.validation.hypothesis,
    marketCount: input.marketCount,
    observationCount: input.validation.observationCount,
    robustnessScore: input.validation.robustnessScore,
    calibrationError: input.candidate?.bucketMetadata?.calibrationError ?? null,
    confidence: input.candidate?.confidence ?? null,
    monthCount,
    uniqueTradingDays: input.validation.sampleConcentration.uniqueTradingDays,
    regimesWithData: input.validation.regimeStability.regimesWithData,
    regimesWithEdge: input.validation.regimeStability.regimesWithEdge,
    monthPersistenceRate: input.validation.timeStability.monthPersistenceRate,
    leaveOneMonthOutStdDev: input.validation.leaveOnePeriodOut.errorStdDev,
    classification: input.classification,
    passes: input.validation.passes,
    promotionEligible: isPromotionEligible(
      input.classification,
      input.validation.passes,
      input.validation.robustnessScore,
    ),
    candidateRank: input.candidateRank,
  };
}

/** Builds per-hypothesis snapshots for the current research run. */
export function buildHypothesisEvolutionRun(
  inputs: LoadedHypothesisEvolutionInputs,
): HypothesisHistoryRun {
  const candidateById = new Map(
    inputs.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const classificationById = new Map(
    inputs.coverageEntries.map((entry) => [entry.hypothesisId, entry.classification]),
  );
  const candidateRanks = buildCandidateRankByHypothesisId(inputs.validations);
  const snapshotsByHypothesisId: Record<string, HypothesisEvolutionRunSnapshot> = {};

  for (const validation of inputs.validations) {
    snapshotsByHypothesisId[validation.hypothesisId] = buildSnapshot({
      timestamp: inputs.runTimestamp,
      marketCount: inputs.marketCount,
      validation,
      candidate: candidateById.get(validation.hypothesisId),
      classification: classificationById.get(validation.hypothesisId) ?? null,
      candidateRank: candidateRanks.get(validation.hypothesisId) ?? null,
    });
  }

  return {
    runId: inputs.runTimestamp,
    marketCount: inputs.marketCount,
    snapshotsByHypothesisId,
  };
}
