import type { HypothesisFailureAnalysisEntry } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import type { HypothesisFailureReasonCategory } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import type { HypothesisPriorityCategory } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisAtlasGroupId } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import {
  listResearchAxisGroups,
  RESEARCH_DIMENSIONS,
} from "@/lib/data/research/dimensions";
import type { ResearchDimensionId } from "@/lib/data/research/dimensions/types";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { parseAtlasHypothesisCandidateId } from "@/lib/data/research/hypothesisRobustness/parseAtlasHypothesisCandidateId";

import {
  buildFailureReasonHistogram,
  buildRobustnessDistribution,
  computeMean,
  computeMedian,
  computeMonthInstability,
  computePassRate,
  computeRegimeInstability,
  roundMetric,
} from "./portfolioAnalyticsMath";
import type {
  PortfolioAnalyticsMetrics,
  PortfolioAnalyticsRankings,
  PortfolioAxisGroupAnalyticsEntry,
  PortfolioDimensionAnalyticsEntry,
  PortfolioRankingEntry,
} from "./researchPortfolioAnalyticsTypes";
import { DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE } from "./researchPortfolioAnalyticsTypes";

export type PortfolioHypothesisRecord = {
  hypothesisId: string;
  groupId: HypothesisAtlasGroupId;
  dimensionIds: readonly ResearchDimensionId[];
  validation: HypothesisValidationEntry | null;
  failureAnalysis: HypothesisFailureAnalysisEntry | null;
};

type MetricsAccumulator = {
  candidateIds: Set<string>;
  validationIds: Set<string>;
  passCount: number;
  robustnessScores: number[];
  scoreGaps: number[];
  nearPromisingCount: number;
  likelySpuriousCount: number;
  blockedByCoverageCount: number;
  observationCounts: number[];
  uniqueTradingDays: number[];
  failureReasonCategories: HypothesisFailureReasonCategory[];
  monthInstabilities: number[];
  regimeInstabilities: number[];
};

function createMetricsAccumulator(): MetricsAccumulator {
  return {
    candidateIds: new Set(),
    validationIds: new Set(),
    passCount: 0,
    robustnessScores: [],
    scoreGaps: [],
    nearPromisingCount: 0,
    likelySpuriousCount: 0,
    blockedByCoverageCount: 0,
    observationCounts: [],
    uniqueTradingDays: [],
    failureReasonCategories: [],
    monthInstabilities: [],
    regimeInstabilities: [],
  };
}

function incrementPriorityCount(
  accumulator: MetricsAccumulator,
  category: HypothesisPriorityCategory | null,
): void {
  if (category === "near-promising") {
    accumulator.nearPromisingCount += 1;
  } else if (category === "likely-spurious") {
    accumulator.likelySpuriousCount += 1;
  } else if (category === "blocked-by-coverage") {
    accumulator.blockedByCoverageCount += 1;
  }
}

function addValidationToAccumulator(
  accumulator: MetricsAccumulator,
  record: PortfolioHypothesisRecord,
  passScoreThreshold: number,
): void {
  if (!record.validation || accumulator.validationIds.has(record.hypothesisId)) {
    return;
  }

  accumulator.validationIds.add(record.hypothesisId);
  const validation = record.validation;

  if (validation.passes) {
    accumulator.passCount += 1;
  }

  accumulator.robustnessScores.push(validation.robustnessScore);
  accumulator.observationCounts.push(validation.observationCount);
  accumulator.uniqueTradingDays.push(validation.sampleConcentration.uniqueTradingDays);
  accumulator.monthInstabilities.push(
    computeMonthInstability(validation.timeStability.monthPersistenceRate),
  );

  const regimeInstability = computeRegimeInstability({
    regimesWithData: validation.regimeStability.regimesWithData,
    regimesWithEdge: validation.regimeStability.regimesWithEdge,
  });
  if (regimeInstability !== null) {
    accumulator.regimeInstabilities.push(regimeInstability);
  }

  const scoreGap =
    record.failureAnalysis?.scoreGap
    ?? roundMetric(Math.max(0, passScoreThreshold - validation.robustnessScore));
  accumulator.scoreGaps.push(scoreGap);

  incrementPriorityCount(
    accumulator,
    record.failureAnalysis?.priorityCategory ?? null,
  );

  if (record.failureAnalysis) {
    for (const reason of record.failureAnalysis.failureReasons) {
      accumulator.failureReasonCategories.push(reason.category);
    }
  }
}

function finalizeMetrics(accumulator: MetricsAccumulator): PortfolioAnalyticsMetrics {
  const validationCount = accumulator.validationIds.size;

  return {
    candidateCount: accumulator.candidateIds.size,
    validationCount,
    passCount: accumulator.passCount,
    passRate: computePassRate(accumulator.passCount, validationCount),
    averageRobustness: computeMean(accumulator.robustnessScores),
    medianRobustness: computeMedian(accumulator.robustnessScores),
    robustnessDistribution: buildRobustnessDistribution(accumulator.robustnessScores),
    averageScoreGap: computeMean(accumulator.scoreGaps),
    nearPromisingCount: accumulator.nearPromisingCount,
    likelySpuriousCount: accumulator.likelySpuriousCount,
    blockedByCoverageCount: accumulator.blockedByCoverageCount,
    averageObservationCount: computeMean(accumulator.observationCounts),
    averageUniqueTradingDays: computeMean(accumulator.uniqueTradingDays),
    failureReasonHistogram: buildFailureReasonHistogram(
      accumulator.failureReasonCategories,
    ),
    averageMonthInstability: computeMean(accumulator.monthInstabilities),
    averageRegimeInstability: computeMean(accumulator.regimeInstabilities),
  };
}

export function resolveGroupDimensionIds(
  groupId: HypothesisAtlasGroupId,
): readonly ResearchDimensionId[] {
  const group = listResearchAxisGroups().find((entry) => entry.groupId === groupId);
  return group?.dimensionIds ?? [];
}

export function buildPortfolioHypothesisRecords(input: {
  candidates: readonly HypothesisCandidate[];
  validations: readonly HypothesisValidationEntry[];
  failureAnalyses: readonly HypothesisFailureAnalysisEntry[];
}): PortfolioHypothesisRecord[] {
  const validationById = new Map(
    input.validations.map((entry) => [entry.hypothesisId, entry]),
  );
  const failureById = new Map(
    input.failureAnalyses.map((entry) => [entry.hypothesisId, entry]),
  );
  const hypothesisIds = new Set<string>([
    ...input.candidates.map((candidate) => candidate.candidateId),
    ...input.validations.map((entry) => entry.hypothesisId),
    ...input.failureAnalyses.map((entry) => entry.hypothesisId),
  ]);

  const records: PortfolioHypothesisRecord[] = [];

  for (const hypothesisId of [...hypothesisIds].sort()) {
    const parsed = parseAtlasHypothesisCandidateId(hypothesisId);

    if (!parsed) {
      continue;
    }

    records.push({
      hypothesisId,
      groupId: parsed.groupId,
      dimensionIds: resolveGroupDimensionIds(parsed.groupId),
      validation: validationById.get(hypothesisId) ?? null,
      failureAnalysis: failureById.get(hypothesisId) ?? null,
    });
  }

  return records;
}

export function aggregatePortfolioMetricsByAxisGroup(input: {
  records: readonly PortfolioHypothesisRecord[];
  candidates: readonly HypothesisCandidate[];
  passScoreThreshold: number;
}): PortfolioAxisGroupAnalyticsEntry[] {
  const accumulators = new Map<HypothesisAtlasGroupId, MetricsAccumulator>();

  for (const group of listResearchAxisGroups()) {
    accumulators.set(group.groupId, createMetricsAccumulator());
  }

  for (const candidate of input.candidates) {
    const parsed = parseAtlasHypothesisCandidateId(candidate.candidateId);
    if (!parsed) {
      continue;
    }

    const accumulator = accumulators.get(parsed.groupId);
    accumulator?.candidateIds.add(candidate.candidateId);
  }

  for (const record of input.records) {
    const accumulator = accumulators.get(record.groupId);
    if (!accumulator) {
      continue;
    }

    addValidationToAccumulator(accumulator, record, input.passScoreThreshold);
  }

  return listResearchAxisGroups().map((group) => ({
    groupId: group.groupId,
    dimensionIds: group.dimensionIds,
    ...finalizeMetrics(accumulators.get(group.groupId) ?? createMetricsAccumulator()),
  }));
}

export function aggregatePortfolioMetricsByDimension(input: {
  records: readonly PortfolioHypothesisRecord[];
  candidates: readonly HypothesisCandidate[];
  passScoreThreshold: number;
}): PortfolioDimensionAnalyticsEntry[] {
  const accumulators = new Map<ResearchDimensionId, MetricsAccumulator>();

  for (const dimension of RESEARCH_DIMENSIONS) {
    accumulators.set(dimension.id, createMetricsAccumulator());
  }

  for (const candidate of input.candidates) {
    const parsed = parseAtlasHypothesisCandidateId(candidate.candidateId);
    if (!parsed) {
      continue;
    }

    for (const dimensionId of resolveGroupDimensionIds(parsed.groupId)) {
      accumulators.get(dimensionId)?.candidateIds.add(candidate.candidateId);
    }
  }

  for (const record of input.records) {
    for (const dimensionId of record.dimensionIds) {
      const accumulator = accumulators.get(dimensionId);
      if (!accumulator) {
        continue;
      }

      addValidationToAccumulator(accumulator, record, input.passScoreThreshold);
    }
  }

  return RESEARCH_DIMENSIONS.map((dimension) => ({
    dimensionId: dimension.id,
    label: dimension.label,
    ...finalizeMetrics(accumulators.get(dimension.id) ?? createMetricsAccumulator()),
  }));
}

function buildRankingEntries(input: {
  entries: readonly { id: string; label: string; value: number }[];
  metric: string;
  direction: "asc" | "desc";
}): readonly PortfolioRankingEntry[] {
  const sorted = [...input.entries].sort((left, right) => {
    const valueCompare =
      input.direction === "desc"
        ? right.value - left.value
        : left.value - right.value;

    if (valueCompare !== 0) {
      return valueCompare;
    }

    return left.id.localeCompare(right.id);
  });

  return sorted.map((entry, index) => ({
    id: entry.id,
    label: entry.label,
    rank: index + 1,
    value: roundMetric(entry.value),
    metric: input.metric,
  }));
}

function buildDimensionRankings(
  dimensions: readonly PortfolioDimensionAnalyticsEntry[],
): Pick<
  PortfolioAnalyticsRankings,
  | "highestYieldingDimensions"
  | "strongestRobustnessDimensions"
  | "weakestRobustnessDimensions"
  | "mostPromisingDimensions"
  | "leastProductiveDimensions"
> {
  return {
    highestYieldingDimensions: buildRankingEntries({
      entries: dimensions.map((entry) => ({
        id: entry.dimensionId,
        label: entry.label,
        value: entry.candidateCount,
      })),
      metric: "candidateCount",
      direction: "desc",
    }),
    strongestRobustnessDimensions: buildRankingEntries({
      entries: dimensions
        .filter((entry) => entry.validationCount > 0 && entry.averageRobustness !== null)
        .map((entry) => ({
          id: entry.dimensionId,
          label: entry.label,
          value: entry.averageRobustness!,
        })),
      metric: "averageRobustness",
      direction: "desc",
    }),
    weakestRobustnessDimensions: buildRankingEntries({
      entries: dimensions
        .filter((entry) => entry.validationCount > 0 && entry.averageRobustness !== null)
        .map((entry) => ({
          id: entry.dimensionId,
          label: entry.label,
          value: entry.averageRobustness!,
        })),
      metric: "averageRobustness",
      direction: "asc",
    }),
    mostPromisingDimensions: buildRankingEntries({
      entries: dimensions.map((entry) => ({
        id: entry.dimensionId,
        label: entry.label,
        value: entry.nearPromisingCount * 100 + (entry.passRate ?? 0),
      })),
      metric: "nearPromisingScore",
      direction: "desc",
    }),
    leastProductiveDimensions: buildRankingEntries({
      entries: dimensions.map((entry) => ({
        id: entry.dimensionId,
        label: entry.label,
        value: entry.candidateCount * 1000 + entry.passCount,
      })),
      metric: "productivityScore",
      direction: "asc",
    }),
  };
}

function buildAxisGroupRankings(
  axisGroups: readonly PortfolioAxisGroupAnalyticsEntry[],
): Pick<
  PortfolioAnalyticsRankings,
  | "highestYieldingAxisGroups"
  | "strongestRobustnessAxisGroups"
  | "weakestRobustnessAxisGroups"
  | "mostPromisingAxisGroups"
  | "leastProductiveAxisGroups"
> {
  return {
    highestYieldingAxisGroups: buildRankingEntries({
      entries: axisGroups.map((entry) => ({
        id: entry.groupId,
        label: entry.groupId,
        value: entry.candidateCount,
      })),
      metric: "candidateCount",
      direction: "desc",
    }),
    strongestRobustnessAxisGroups: buildRankingEntries({
      entries: axisGroups
        .filter((entry) => entry.validationCount > 0 && entry.averageRobustness !== null)
        .map((entry) => ({
          id: entry.groupId,
          label: entry.groupId,
          value: entry.averageRobustness!,
        })),
      metric: "averageRobustness",
      direction: "desc",
    }),
    weakestRobustnessAxisGroups: buildRankingEntries({
      entries: axisGroups
        .filter((entry) => entry.validationCount > 0 && entry.averageRobustness !== null)
        .map((entry) => ({
          id: entry.groupId,
          label: entry.groupId,
          value: entry.averageRobustness!,
        })),
      metric: "averageRobustness",
      direction: "asc",
    }),
    mostPromisingAxisGroups: buildRankingEntries({
      entries: axisGroups.map((entry) => ({
        id: entry.groupId,
        label: entry.groupId,
        value: entry.nearPromisingCount * 100 + (entry.passRate ?? 0),
      })),
      metric: "nearPromisingScore",
      direction: "desc",
    }),
    leastProductiveAxisGroups: buildRankingEntries({
      entries: axisGroups.map((entry) => ({
        id: entry.groupId,
        label: entry.groupId,
        value: entry.candidateCount * 1000 + entry.passCount,
      })),
      metric: "productivityScore",
      direction: "asc",
    }),
  };
}

export function buildPortfolioAnalyticsRankings(input: {
  dimensions: readonly PortfolioDimensionAnalyticsEntry[];
  axisGroups: readonly PortfolioAxisGroupAnalyticsEntry[];
}): PortfolioAnalyticsRankings {
  return {
    ...buildDimensionRankings(input.dimensions),
    ...buildAxisGroupRankings(input.axisGroups),
  };
}

export function resolvePassScoreThreshold(
  validationConfigPassScore: number | null | undefined,
  failureAnalysisPassThreshold: number | null | undefined,
): number {
  return (
    validationConfigPassScore
    ?? failureAnalysisPassThreshold
    ?? DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE
  );
}
