import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisAtlasGroupId } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { normalizeMispricingAtlas } from "@/lib/data/research/hypothesisCandidates/normalizeMispricingAtlas";
import {
  collectAtlasBucketGroupsFromNormalizedAtlas,
  getResearchAxisGroup,
  listResearchAxisGroups,
} from "@/lib/data/research/dimensions";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { parseAtlasHypothesisCandidateId } from "@/lib/data/research/hypothesisRobustness/parseAtlasHypothesisCandidateId";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import {
  computeBucketSparsity,
  computeCoverageQuality,
  computeInteractionScore,
  formatInteractionLabel,
  isNearPromisingHeuristic,
  mean,
  normalizedBucketEntropy,
  roundMetric,
} from "./computeInteractionMetrics";
import type {
  DimensionInteractionMetrics,
  DimensionInteractionRankings,
} from "./dimensionInteractionAnalyticsTypes";

export type AnalyzeDimensionInteractionsInput = {
  candidates: readonly HypothesisCandidate[];
  validations: readonly HypothesisValidationEntry[];
  atlas: MispricingAtlas | null;
  priorityByHypothesisId: ReadonlyMap<string, string>;
  passScoreThreshold: number;
  minSampleThreshold: number;
  nearPromisingRobustnessFloor: number;
};

export function listCompositeResearchAxisGroups() {
  return listResearchAxisGroups().filter(
    (group) => group.dimensionIds.length >= 2 || group.groupId === "probabilityRegime",
  );
}

function bucketsForGroup(
  atlas: MispricingAtlas | null,
  groupId: HypothesisAtlasGroupId,
) {
  if (!atlas) {
    return [] as readonly import("@/lib/data/research/mispricingAtlas/mispricingAtlasTypes").MispricingAtlasBucketSummary[];
  }

  const normalized = normalizeMispricingAtlas(atlas, DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE);
  const group = collectAtlasBucketGroupsFromNormalizedAtlas(normalized).find(
    (entry) => entry.groupId === groupId,
  );

  return group?.buckets ?? [];
}

function isNearPromising(input: {
  hypothesisId: string;
  validation: HypothesisValidationEntry;
  priorityByHypothesisId: ReadonlyMap<string, string>;
  passScoreThreshold: number;
  nearPromisingRobustnessFloor: number;
}): boolean {
  const priority = input.priorityByHypothesisId.get(input.hypothesisId);
  if (priority === "near-promising") {
    return true;
  }

  return isNearPromisingHeuristic({
    passes: input.validation.passes,
    robustnessScore: input.validation.robustnessScore,
    passScoreThreshold: input.passScoreThreshold,
    nearPromisingRobustnessFloor: input.nearPromisingRobustnessFloor,
  });
}

export function analyzeDimensionInteractions(
  input: AnalyzeDimensionInteractionsInput,
): DimensionInteractionMetrics[] {
  const validationById = new Map(
    input.validations.map((validation) => [validation.hypothesisId, validation]),
  );

  const candidatesByGroup = new Map<HypothesisAtlasGroupId, HypothesisCandidate[]>();
  for (const candidate of input.candidates) {
    const reference = parseAtlasHypothesisCandidateId(candidate.candidateId);
    if (!reference) {
      continue;
    }

    const existing = candidatesByGroup.get(reference.groupId) ?? [];
    existing.push(candidate);
    candidatesByGroup.set(reference.groupId, existing);
  }

  return listCompositeResearchAxisGroups().map((group) => {
    const groupCandidates = candidatesByGroup.get(group.groupId) ?? [];
    const validatedEntries = groupCandidates.flatMap((candidate) => {
      const validation = validationById.get(candidate.candidateId);
      return validation ? [{ candidate, validation }] : [];
    });

    const passCount = validatedEntries.filter((entry) => entry.validation.passes).length;
    const passRate =
      validatedEntries.length > 0 ? roundMetric(passCount / validatedEntries.length) : 0;

    const robustnessScores = validatedEntries.map((entry) => entry.validation.robustnessScore);
    const averageRobustness = roundMetric(mean(robustnessScores));

    const nearPromisingCount = validatedEntries.filter((entry) =>
      isNearPromising({
        hypothesisId: entry.candidate.candidateId,
        validation: entry.validation,
        priorityByHypothesisId: input.priorityByHypothesisId,
        passScoreThreshold: input.passScoreThreshold,
        nearPromisingRobustnessFloor: input.nearPromisingRobustnessFloor,
      }),
    ).length;
    const nearPromisingFrequency =
      validatedEntries.length > 0
        ? roundMetric(nearPromisingCount / validatedEntries.length)
        : 0;

    const calibrationErrors = groupCandidates
      .map((candidate) => candidate.bucketMetadata?.calibrationError)
      .filter((value): value is number => typeof value === "number");
    const averageCalibrationError = roundMetric(
      mean(calibrationErrors.map((value) => Math.abs(value))),
    );

    const buckets = bucketsForGroup(input.atlas, group.groupId);
    const bucketSparsity = computeBucketSparsity(buckets);
    const entropy = normalizedBucketEntropy(buckets);
    const coverageQuality = computeCoverageQuality({
      buckets,
      minSampleThreshold: input.minSampleThreshold,
    });

    const interactionScore = computeInteractionScore({
      passRate,
      averageRobustness,
      nearPromisingFrequency,
      averageCalibrationError,
      coverageQuality,
      bucketSparsity,
      entropy,
    });

    const axisGroup = getResearchAxisGroup(group.groupId);

    return {
      groupId: group.groupId,
      interactionLabel: formatInteractionLabel(axisGroup.dimensionIds),
      dimensionIds: axisGroup.dimensionIds,
      axisCount: axisGroup.dimensionIds.length,
      candidateCount: groupCandidates.length,
      validatedCount: validatedEntries.length,
      passRate,
      averageRobustness,
      nearPromisingFrequency,
      averageCalibrationError,
      coverageQuality,
      bucketSparsity,
      entropy,
      totalBuckets: buckets.length,
      nonEmptyBuckets: buckets.filter((bucket) => bucket.observations > 0).length,
      interactionScore,
    };
  });
}

export function rankDimensionInteractions(
  interactions: readonly DimensionInteractionMetrics[],
): DimensionInteractionRankings {
  const sortedByScore = [...interactions].sort((left, right) => {
    const scoreCompare = right.interactionScore - left.interactionScore;
    if (scoreCompare !== 0) {
      return scoreCompare;
    }

    return left.groupId.localeCompare(right.groupId);
  });

  const highPotential = [...interactions]
    .filter(
      (entry) =>
        entry.nearPromisingFrequency >= 0.25
        && entry.passRate < 0.5
        && entry.averageRobustness >= 45
        && entry.validatedCount > 0,
    )
    .sort((left, right) => {
      const nearCompare = right.nearPromisingFrequency - left.nearPromisingFrequency;
      if (nearCompare !== 0) {
        return nearCompare;
      }

      return right.averageRobustness - left.averageRobustness;
    });

  const highNoise = [...interactions]
    .filter(
      (entry) =>
        entry.entropy >= 0.65
        && entry.bucketSparsity >= 0.4
        && entry.passRate <= 0.35,
    )
    .sort((left, right) => {
      const noiseScore = (entry: DimensionInteractionMetrics) =>
        entry.entropy * 0.6 + entry.bucketSparsity * 0.4;
      const noiseCompare = noiseScore(right) - noiseScore(left);
      if (noiseCompare !== 0) {
        return noiseCompare;
      }

      return left.groupId.localeCompare(right.groupId);
    });

  return {
    bestInteractions: sortedByScore.map((entry) => entry.groupId),
    weakestInteractions: [...sortedByScore].reverse().map((entry) => entry.groupId),
    highPotentialInteractions: highPotential.map((entry) => entry.groupId),
    highNoiseInteractions: highNoise.map((entry) => entry.groupId),
  };
}

export function defaultAnalyzeConfig() {
  return {
    passScoreThreshold: DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE,
    minSampleThreshold: DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE,
    nearPromisingRobustnessFloor: 50,
  };
}
