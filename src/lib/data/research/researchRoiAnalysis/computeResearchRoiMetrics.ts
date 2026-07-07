import type { HypothesisAtlasGroupId } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisFailureAnalysisEntry } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import type { HypothesisRefinementCandidate } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { parseAtlasHypothesisCandidateId } from "@/lib/data/research/hypothesisRobustness/parseAtlasHypothesisCandidateId";
import { collectMispricingAtlasBucketGroups } from "@/lib/data/research/mispricingAtlas/computeMispricingAtlasCoverage";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import {
  axisGroupLabel,
  researchDimensionLabel,
  resolveResearchDimensionsFromGroupId,
} from "./resolveResearchDimensionsFromGroupId";
import type {
  ResearchRoiAnalysisSummary,
  ResearchRoiDimensionId,
  ResearchRoiOverallMetrics,
  ResearchRoiRankings,
  ResearchRoiRefinementImprovementEntry,
  ResearchRoiSliceMetrics,
} from "./researchRoiAnalysisTypes";
import { RESEARCH_ROI_DIMENSION_IDS } from "./researchRoiAnalysisTypes";

type CandidateSlice = {
  candidateId: string;
  groupId: HypothesisAtlasGroupId | "leadLag" | "refinement" | "unknown";
  bucketId: string | null;
  dimensions: readonly ResearchRoiDimensionId[];
};

type SliceAccumulator = {
  candidateIds: Set<string>;
  validatedIds: Set<string>;
  nearPromisingIds: Set<string>;
  failingIds: Set<string>;
  robustnessScores: number[];
  bucketIds: Set<string>;
  totalBuckets: number;
  nonEmptyBuckets: number;
};

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return roundMetric(numerator / denominator);
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function computeRoiScore(input: {
  validationRate: number | null;
  nearPromisingRate: number | null;
  averageRobustnessScore: number | null;
  candidateYieldPerBucket: number | null;
}): number | null {
  if (
    input.validationRate === null
    && input.nearPromisingRate === null
    && input.averageRobustnessScore === null
    && input.candidateYieldPerBucket === null
  ) {
    return null;
  }

  const validationComponent = (input.validationRate ?? 0) * 0.35;
  const nearPromisingComponent = (input.nearPromisingRate ?? 0) * 0.25;
  const robustnessComponent = ((input.averageRobustnessScore ?? 0) / 100) * 0.25;
  const yieldComponent = Math.min((input.candidateYieldPerBucket ?? 0) * 10, 1) * 0.15;

  return roundMetric((validationComponent + nearPromisingComponent + robustnessComponent + yieldComponent) * 100);
}

function classifyCandidate(candidate: HypothesisCandidate): CandidateSlice {
  if (candidate.refinementRegistration) {
    return {
      candidateId: candidate.candidateId,
      groupId: "refinement",
      bucketId: candidate.bucketMetadata?.bucketId ?? null,
      dimensions: ["probability"],
    };
  }

  if (candidate.candidateId.startsWith("lead-lag-")) {
    return {
      candidateId: candidate.candidateId,
      groupId: "leadLag",
      bucketId: null,
      dimensions: ["leadLag"],
    };
  }

  const parsed = parseAtlasHypothesisCandidateId(candidate.candidateId);
  if (!parsed) {
    return {
      candidateId: candidate.candidateId,
      groupId: "unknown",
      bucketId: candidate.bucketMetadata?.bucketId ?? null,
      dimensions: [],
    };
  }

  return {
    candidateId: candidate.candidateId,
    groupId: parsed.groupId,
    bucketId: parsed.bucketId,
    dimensions: resolveResearchDimensionsFromGroupId(parsed.groupId),
  };
}

function createSliceAccumulator(totalBuckets = 0, nonEmptyBuckets = 0): SliceAccumulator {
  return {
    candidateIds: new Set(),
    validatedIds: new Set(),
    nearPromisingIds: new Set(),
    failingIds: new Set(),
    robustnessScores: [],
    bucketIds: new Set(),
    totalBuckets,
    nonEmptyBuckets,
  };
}

function ingestCandidateIntoSlice(
  accumulator: SliceAccumulator,
  slice: CandidateSlice,
  validation: HypothesisValidationEntry | undefined,
  failure: HypothesisFailureAnalysisEntry | undefined,
): void {
  accumulator.candidateIds.add(slice.candidateId);
  if (slice.bucketId) {
    accumulator.bucketIds.add(slice.bucketId);
  }

  if (validation) {
    accumulator.robustnessScores.push(validation.robustnessScore);
    if (validation.passes) {
      accumulator.validatedIds.add(slice.candidateId);
    } else {
      accumulator.failingIds.add(slice.candidateId);
    }
  }

  if (failure?.priorityCategory === "near-promising") {
    accumulator.nearPromisingIds.add(slice.candidateId);
  }
}

function finalizeSliceMetrics(
  id: string,
  label: string,
  accumulator: SliceAccumulator,
): ResearchRoiSliceMetrics {
  const candidateCount = accumulator.candidateIds.size;
  const validatedCount = accumulator.validatedIds.size;
  const nearPromisingCount = accumulator.nearPromisingIds.size;
  const failingCount = accumulator.failingIds.size;
  const bucketsWithCandidates = accumulator.bucketIds.size;
  const validationRate = safeRate(validatedCount, candidateCount);
  const nearPromisingRate = safeRate(nearPromisingCount, candidateCount);
  const averageRobustnessScore = average(accumulator.robustnessScores);
  const candidateYieldPerBucket = safeRate(candidateCount, accumulator.totalBuckets);
  const bucketUtilizationRate = safeRate(bucketsWithCandidates, accumulator.totalBuckets);
  const validationEfficiency = safeRate(
    validatedCount,
    validatedCount + failingCount,
  );
  const researchCostScore =
    accumulator.totalBuckets > 0
      ? roundMetric(
        accumulator.totalBuckets
          / Math.max(validatedCount + nearPromisingCount, 1),
      )
      : null;
  const efficiencyScore =
    accumulator.totalBuckets > 0
      ? roundMetric((validatedCount * 2 + nearPromisingCount) / accumulator.totalBuckets)
      : null;

  return {
    id,
    label,
    candidateCount,
    validatedCount,
    nearPromisingCount,
    failingCount,
    totalBuckets: accumulator.totalBuckets,
    bucketsWithCandidates,
    nonEmptyBuckets: accumulator.nonEmptyBuckets,
    candidateYieldPerBucket,
    validationRate,
    nearPromisingRate,
    averageRobustnessScore,
    bucketUtilizationRate,
    validationEfficiency,
    roiScore: computeRoiScore({
      validationRate,
      nearPromisingRate,
      averageRobustnessScore,
      candidateYieldPerBucket,
    }),
    researchCostScore,
    efficiencyScore,
  };
}

function buildAtlasBucketIndex(atlas: MispricingAtlas | null): {
  axisGroupBuckets: Map<HypothesisAtlasGroupId, { total: number; nonEmpty: number }>;
  bucketToGroup: Map<string, HypothesisAtlasGroupId>;
  totalBuckets: number;
  nonEmptyBuckets: number;
} {
  const axisGroupBuckets = new Map<HypothesisAtlasGroupId, { total: number; nonEmpty: number }>();
  const bucketToGroup = new Map<string, HypothesisAtlasGroupId>();
  let totalBuckets = 0;
  let nonEmptyBuckets = 0;

  if (!atlas) {
    return { axisGroupBuckets, bucketToGroup, totalBuckets, nonEmptyBuckets };
  }

  const groups = collectMispricingAtlasBucketGroups({
    probabilityBuckets: atlas.probabilityBuckets,
    timeRemainingBuckets: atlas.timeRemainingBuckets,
    moneynessBuckets: atlas.moneynessBuckets,
    volatilityBuckets: atlas.volatilityBuckets,
    momentumBuckets: atlas.momentumBuckets,
    coarseBuckets: atlas.coarseBuckets,
  });

  for (const group of groups) {
    const groupId = group.dimension as HypothesisAtlasGroupId;
    const nonEmpty = group.buckets.filter((bucket) => bucket.observations > 0).length;
    axisGroupBuckets.set(groupId, { total: group.buckets.length, nonEmpty });
    totalBuckets += group.buckets.length;
    nonEmptyBuckets += nonEmpty;

    for (const bucket of group.buckets) {
      bucketToGroup.set(bucket.bucketId, groupId);
    }
  }

  return { axisGroupBuckets, bucketToGroup, totalBuckets, nonEmptyBuckets };
}

function buildRefinementImprovements(input: {
  refinements: readonly HypothesisRefinementCandidate[];
  validations: readonly HypothesisValidationEntry[];
  candidates: readonly HypothesisCandidate[];
}): {
  entries: ResearchRoiRefinementImprovementEntry[];
  averageImprovement: number | null;
} {
  const validationById = new Map(
    input.validations.map((validation) => [validation.hypothesisId, validation]),
  );
  const childByParent = new Map<string, HypothesisCandidate>();

  for (const candidate of input.candidates) {
    const parentId = candidate.refinementRegistration?.parentHypothesisId;
    if (!parentId) {
      continue;
    }

    childByParent.set(parentId, candidate);
  }

  const entries: ResearchRoiRefinementImprovementEntry[] = [];
  const deltas: number[] = [];

  for (const refinement of input.refinements) {
    const parentValidation = validationById.get(refinement.parentHypothesisId);
    const parentScore =
      parentValidation?.robustnessScore ?? refinement.parentRobustnessScore;
    const child = childByParent.get(refinement.parentHypothesisId);
    const childValidation = child ? validationById.get(child.candidateId) : undefined;
    const childScore = childValidation?.robustnessScore ?? null;
    const robustnessDelta =
      childScore !== null ? roundMetric(childScore - parentScore) : null;

    if (robustnessDelta !== null) {
      deltas.push(robustnessDelta);
    }

    entries.push({
      parentHypothesisId: refinement.parentHypothesisId,
      childHypothesisId: child?.candidateId ?? null,
      parentRobustnessScore: parentScore,
      childRobustnessScore: childScore,
      robustnessDelta,
      refinementType: refinement.refinementType,
    });
  }

  return {
    entries: entries.sort((left, right) =>
      left.parentHypothesisId.localeCompare(right.parentHypothesisId),
    ),
    averageImprovement: average(deltas),
  };
}

function sortByRoiDesc(slices: readonly ResearchRoiSliceMetrics[]): ResearchRoiSliceMetrics[] {
  return [...slices].sort((left, right) => {
    const leftScore = left.roiScore ?? -1;
    const rightScore = right.roiScore ?? -1;
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return left.label.localeCompare(right.label);
  });
}

function sortByRoiAsc(slices: readonly ResearchRoiSliceMetrics[]): ResearchRoiSliceMetrics[] {
  return [...slices].sort((left, right) => {
    const leftScore = left.roiScore ?? Number.POSITIVE_INFINITY;
    const rightScore = right.roiScore ?? Number.POSITIVE_INFINITY;
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    return left.label.localeCompare(right.label);
  });
}

function sortByExpensive(slices: readonly ResearchRoiSliceMetrics[]): ResearchRoiSliceMetrics[] {
  return [...slices].sort((left, right) => {
    const leftScore = left.researchCostScore ?? -1;
    const rightScore = right.researchCostScore ?? -1;
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return left.label.localeCompare(right.label);
  });
}

function sortByEfficiency(slices: readonly ResearchRoiSliceMetrics[]): ResearchRoiSliceMetrics[] {
  return [...slices].sort((left, right) => {
    const leftScore = left.efficiencyScore ?? -1;
    const rightScore = right.efficiencyScore ?? -1;
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return left.label.localeCompare(right.label);
  });
}

/** Computes read-only research ROI metrics from existing hypothesis artifacts. */
export function computeResearchRoiMetrics(input: {
  candidates: readonly HypothesisCandidate[];
  validations: readonly HypothesisValidationEntry[];
  failureAnalyses: readonly HypothesisFailureAnalysisEntry[];
  refinements: readonly HypothesisRefinementCandidate[];
  mispricingAtlas: MispricingAtlas | null;
  emptyInputReasons: readonly string[];
}): ResearchRoiAnalysisSummary {
  const validationById = new Map(
    input.validations.map((validation) => [validation.hypothesisId, validation]),
  );
  const failureById = new Map(
    input.failureAnalyses.map((analysis) => [analysis.hypothesisId, analysis]),
  );
  const classified = input.candidates.map((candidate) => classifyCandidate(candidate));
  const atlasIndex = buildAtlasBucketIndex(input.mispricingAtlas);

  const dimensionAccumulators = new Map<ResearchRoiDimensionId, SliceAccumulator>();
  for (const dimensionId of RESEARCH_ROI_DIMENSION_IDS) {
    dimensionAccumulators.set(dimensionId, createSliceAccumulator());
  }

  const axisGroupAccumulators = new Map<string, SliceAccumulator>();
  const bucketAccumulators = new Map<string, SliceAccumulator>();

  const uniqueBucketIds = new Set<string>();

  for (const slice of classified) {
    const validation = validationById.get(slice.candidateId);
    const failure = failureById.get(slice.candidateId);

    if (slice.bucketId) {
      uniqueBucketIds.add(slice.bucketId);
    }

    for (const dimensionId of slice.dimensions) {
      const accumulator = dimensionAccumulators.get(dimensionId)!;
      ingestCandidateIntoSlice(accumulator, slice, validation, failure);
    }

    if (slice.groupId !== "unknown" && slice.groupId !== "refinement" && slice.groupId !== "leadLag") {
      const bucketStats = atlasIndex.axisGroupBuckets.get(slice.groupId) ?? {
        total: 0,
        nonEmpty: 0,
      };
      if (!axisGroupAccumulators.has(slice.groupId)) {
        axisGroupAccumulators.set(
          slice.groupId,
          createSliceAccumulator(bucketStats.total, bucketStats.nonEmpty),
        );
      }

      ingestCandidateIntoSlice(
        axisGroupAccumulators.get(slice.groupId)!,
        slice,
        validation,
        failure,
      );
    }

    if (slice.groupId === "leadLag") {
      if (!axisGroupAccumulators.has("leadLag")) {
        axisGroupAccumulators.set("leadLag", createSliceAccumulator());
      }

      ingestCandidateIntoSlice(
        axisGroupAccumulators.get("leadLag")!,
        slice,
        validation,
        failure,
      );
    }

    if (slice.bucketId) {
      const groupId = atlasIndex.bucketToGroup.get(slice.bucketId) ?? slice.groupId;
      const bucketKey = `${groupId}:${slice.bucketId}`;
      if (!bucketAccumulators.has(bucketKey)) {
        bucketAccumulators.set(bucketKey, createSliceAccumulator(1, 1));
      }

      ingestCandidateIntoSlice(
        bucketAccumulators.get(bucketKey)!,
        slice,
        validation,
        failure,
      );
    }
  }

  const dimensionMetrics = RESEARCH_ROI_DIMENSION_IDS.map((dimensionId) =>
    finalizeSliceMetrics(
      dimensionId,
      researchDimensionLabel(dimensionId),
      dimensionAccumulators.get(dimensionId)!,
    ),
  );

  const axisGroupMetrics = [...axisGroupAccumulators.entries()]
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([groupId, accumulator]) =>
      finalizeSliceMetrics(
        groupId,
        groupId === "leadLag" ? researchDimensionLabel("leadLag") : axisGroupLabel(groupId as HypothesisAtlasGroupId),
        accumulator,
      ),
    );

  const bucketMetrics = [...bucketAccumulators.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([bucketKey, accumulator]) => {
      const [, bucketId] = bucketKey.split(":");
      return finalizeSliceMetrics(bucketKey, bucketId ?? bucketKey, accumulator);
    });

  const atlasCandidates = classified.filter(
    (slice) => slice.groupId !== "leadLag" && slice.groupId !== "refinement" && slice.groupId !== "unknown",
  ).length;
  const leadLagCandidates = classified.filter((slice) => slice.groupId === "leadLag").length;
  const refinementCandidates = classified.filter((slice) => slice.groupId === "refinement").length;
  const validatedCandidates = input.validations.filter((validation) => validation.passes).length;
  const failingCandidates = input.validations.filter((validation) => !validation.passes).length;
  const nearPromisingCandidates = input.failureAnalyses.filter(
    (analysis) => analysis.priorityCategory === "near-promising",
  ).length;
  const robustnessScores = input.validations.map((validation) => validation.robustnessScore);
  const validationRate = safeRate(validatedCandidates, input.candidates.length);
  const nearPromisingRate = safeRate(nearPromisingCandidates, input.candidates.length);
  const averageRobustnessScore = average(robustnessScores);
  const candidateGenerationEfficiency = safeRate(
    input.candidates.length,
    atlasIndex.totalBuckets,
  );
  const bucketUtilizationRate = safeRate(uniqueBucketIds.size, atlasIndex.totalBuckets);
  const validationEfficiency = safeRate(
    validatedCandidates,
    validatedCandidates + failingCandidates,
  );

  const refinementStats = buildRefinementImprovements({
    refinements: input.refinements,
    validations: input.validations,
    candidates: input.candidates,
  });

  const overall: ResearchRoiOverallMetrics = {
    totalCandidates: input.candidates.length,
    atlasCandidates,
    leadLagCandidates,
    refinementCandidates,
    validatedCandidates,
    failingCandidates,
    nearPromisingCandidates,
    candidateGenerationEfficiency,
    validationRate,
    nearPromisingRate,
    averageRobustnessScore,
    averageRobustnessImprovementAfterRefinement: refinementStats.averageImprovement,
    refinementPairsCompared: refinementStats.entries.filter(
      (entry) => entry.robustnessDelta !== null,
    ).length,
    totalAtlasBuckets: atlasIndex.totalBuckets,
    nonEmptyAtlasBuckets: atlasIndex.nonEmptyBuckets,
    bucketsWithCandidates: uniqueBucketIds.size,
    bucketUtilizationRate,
    validationEfficiency,
    overallRoiScore: computeRoiScore({
      validationRate,
      nearPromisingRate,
      averageRobustnessScore,
      candidateYieldPerBucket: candidateGenerationEfficiency,
    }),
  };

  const rankings: ResearchRoiRankings = {
    highestRoiDimensions: sortByRoiDesc(dimensionMetrics.filter((slice) => slice.candidateCount > 0)),
    lowestRoiDimensions: sortByRoiAsc(
      sortByRoiDesc(dimensionMetrics.filter((slice) => slice.candidateCount > 0)),
    ),
    highestRoiAxisGroups: sortByRoiDesc(axisGroupMetrics.filter((slice) => slice.candidateCount > 0)),
    mostExpensiveResearchAreas: sortByExpensive(
      axisGroupMetrics.filter((slice) => slice.totalBuckets > 0),
    ),
    mostEfficientResearchAreas: sortByEfficiency(
      axisGroupMetrics.filter((slice) => slice.totalBuckets > 0 || slice.candidateCount > 0),
    ),
  };

  return {
    overall,
    rankings,
    dimensionMetrics,
    axisGroupMetrics,
    bucketMetrics,
    refinementImprovements: refinementStats.entries,
    emptyInputReasons: input.emptyInputReasons,
  };
}
