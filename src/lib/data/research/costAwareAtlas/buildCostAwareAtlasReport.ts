import {
  compareBucketEntriesDeterministically,
  compareRankingEntriesDeterministically,
} from "./costAwareAtlasMath";
import type {
  CostAwareAtlasConfig,
  CostAwareAtlasRankingEntry,
  CostAwareAtlasReport,
  CostAwareAtlasSummary,
  CostAwareAtlasWarning,
  CostAwareBucketEntry,
  CostAwareGrossEdgeDisappearanceEntry,
  TradeabilityClassification,
} from "./costAwareAtlasTypes";
import { COST_AWARE_TRADEABILITY_ORDER } from "./costAwareAtlasConfig";

const RANKING_LIMIT = 10;

function createEmptyTradeabilityCounts(): Record<TradeabilityClassification, number> {
  return {
    "tradeable-positive": 0,
    "tradeable-negative": 0,
    "gross-only": 0,
    "untradeable-wide-spread": 0,
    "untradeable-missing-quotes": 0,
    underpowered: 0,
    unknown: 0,
  };
}

function buildSummary(input: {
  buckets: readonly CostAwareBucketEntry[];
  totalObservations: number;
  derivedObservations: number;
  officialObservations: number;
}): CostAwareAtlasSummary {
  const tradeabilityCounts = createEmptyTradeabilityCounts();
  let nonEmptyBuckets = 0;

  for (const bucket of input.buckets) {
    if (bucket.primaryCohort.observations === 0) {
      continue;
    }

    nonEmptyBuckets += 1;
    tradeabilityCounts[bucket.primaryCohort.tradeability] += 1;
  }

  const untradeableBuckets =
    tradeabilityCounts["untradeable-wide-spread"]
    + tradeabilityCounts["untradeable-missing-quotes"];

  return {
    totalBuckets: input.buckets.length,
    nonEmptyBuckets,
    tradeabilityCounts,
    tradeablePositiveBuckets: tradeabilityCounts["tradeable-positive"],
    grossOnlyBuckets: tradeabilityCounts["gross-only"],
    untradeableBuckets,
    underpoweredBuckets: tradeabilityCounts.underpowered,
    derivedSettlementObservationShare:
      input.totalObservations > 0
        ? input.derivedObservations / input.totalObservations
        : null,
    officialSettlementObservationShare:
      input.totalObservations > 0
        ? input.officialObservations / input.totalObservations
        : null,
  };
}

function buildRankings(
  buckets: readonly CostAwareBucketEntry[],
): CostAwareAtlasReport["rankings"] {
  const rankingCandidates = buckets
    .filter((bucket) => bucket.primaryCohort.observations > 0)
    .map((bucket) => ({
      dimension: bucket.dimension,
      bucketId: bucket.bucketId,
      bucketLabel: bucket.bucketLabel,
      grossExpectedValueCents: bucket.primaryCohort.grossExpectedValueCents,
      feeAdjustedExpectedValueCents:
        bucket.primaryCohort.feeAdjustedExpectedValueCents,
      tradeability: bucket.primaryCohort.tradeability,
      impliedSide: bucket.primaryCohort.impliedSide,
      observations: bucket.primaryCohort.observations,
    }));

  const topGrossEdges: CostAwareAtlasRankingEntry[] = rankingCandidates
    .filter((entry) => entry.grossExpectedValueCents != null)
    .sort((left, right) =>
      compareRankingEntriesDeterministically(
        {
          valueCents: left.grossExpectedValueCents!,
          dimension: left.dimension,
          bucketId: left.bucketId,
        },
        {
          valueCents: right.grossExpectedValueCents!,
          dimension: right.dimension,
          bucketId: right.bucketId,
        },
        "desc",
      ),
    )
    .slice(0, RANKING_LIMIT)
    .map((entry) => ({
      dimension: entry.dimension,
      bucketId: entry.bucketId,
      bucketLabel: entry.bucketLabel,
      valueCents: entry.grossExpectedValueCents!,
      tradeability: entry.tradeability,
      impliedSide: entry.impliedSide,
      observations: entry.observations,
    }));

  const topNetEdges: CostAwareAtlasRankingEntry[] = rankingCandidates
    .filter((entry) => entry.feeAdjustedExpectedValueCents != null)
    .sort((left, right) =>
      compareRankingEntriesDeterministically(
        {
          valueCents: left.feeAdjustedExpectedValueCents!,
          dimension: left.dimension,
          bucketId: left.bucketId,
        },
        {
          valueCents: right.feeAdjustedExpectedValueCents!,
          dimension: right.dimension,
          bucketId: right.bucketId,
        },
        "desc",
      ),
    )
    .slice(0, RANKING_LIMIT)
    .map((entry) => ({
      dimension: entry.dimension,
      bucketId: entry.bucketId,
      bucketLabel: entry.bucketLabel,
      valueCents: entry.feeAdjustedExpectedValueCents!,
      tradeability: entry.tradeability,
      impliedSide: entry.impliedSide,
      observations: entry.observations,
    }));

  const largestGrossEdgeDisappearances: CostAwareGrossEdgeDisappearanceEntry[] =
    rankingCandidates
      .filter(
        (entry) =>
          entry.grossExpectedValueCents != null
          && entry.feeAdjustedExpectedValueCents != null
          && entry.grossExpectedValueCents > 0
          && entry.feeAdjustedExpectedValueCents < entry.grossExpectedValueCents,
      )
      .map((entry) => ({
        dimension: entry.dimension,
        bucketId: entry.bucketId,
        bucketLabel: entry.bucketLabel,
        grossExpectedValueCents: entry.grossExpectedValueCents!,
        feeAdjustedExpectedValueCents: entry.feeAdjustedExpectedValueCents!,
        edgeLostCents:
          entry.grossExpectedValueCents! - entry.feeAdjustedExpectedValueCents!,
        observations: entry.observations,
      }))
      .sort((left, right) => {
        const edgeCompare = right.edgeLostCents - left.edgeLostCents;
        if (edgeCompare !== 0) {
          return edgeCompare;
        }

        return compareBucketEntriesDeterministically(left, right);
      })
      .slice(0, RANKING_LIMIT);

  return {
    topGrossEdges,
    topNetEdges,
    largestGrossEdgeDisappearances,
  };
}

function buildWarnings(input: {
  buckets: readonly CostAwareBucketEntry[];
  config: CostAwareAtlasConfig;
}): CostAwareAtlasWarning[] {
  const warnings: CostAwareAtlasWarning[] = [];

  for (const bucket of input.buckets) {
    const primary = bucket.primaryCohort;

    if (primary.tradeability === "underpowered" && primary.observations > 0) {
      warnings.push({
        code: "underpowered-bucket",
        message: `${bucket.bucketLabel} has ${primary.observations} observations (< ${input.config.minSampleThreshold}).`,
        dimension: bucket.dimension,
        bucketId: bucket.bucketId,
      });
    }

    const allCohort = bucket.cohorts.find((cohort) => cohort.cohortId === "all");
    const validCohort = bucket.cohorts.find(
      (cohort) => cohort.cohortId === "validBidAsk",
    );
    if (
      allCohort
      && validCohort
      && allCohort.observations > 0
      && validCohort.observations / allCohort.observations < 0.5
    ) {
      warnings.push({
        code: "fillability-gap",
        message: `${bucket.bucketLabel} has only ${validCohort.observations}/${allCohort.observations} observations with valid bid/ask.`,
        dimension: bucket.dimension,
        bucketId: bucket.bucketId,
      });
    }

    if (bucket.settlementSourceStatus === "derived" && primary.observations > 0) {
      warnings.push({
        code: "derived-settlement-share",
        message: `${bucket.bucketLabel} is dominated by derived settlement observations.`,
        dimension: bucket.dimension,
        bucketId: bucket.bucketId,
      });
    }
  }

  return warnings.sort((left, right) => {
    const codeCompare = left.code.localeCompare(right.code);
    if (codeCompare !== 0) {
      return codeCompare;
    }

    const dimensionCompare = (left.dimension ?? "").localeCompare(
      right.dimension ?? "",
    );
    if (dimensionCompare !== 0) {
      return dimensionCompare;
    }

    return (left.bucketId ?? "").localeCompare(right.bucketId ?? "");
  });
}

export function buildCostAwareAtlasReport(input: {
  generatedAt: string;
  inputRoot: string;
  outputPath: string;
  htmlOutputPath: string;
  mispricingAtlasPath: string | null;
  config: CostAwareAtlasConfig;
  buckets: readonly CostAwareBucketEntry[];
  totalObservations: number;
  derivedObservations: number;
  officialObservations: number;
}): CostAwareAtlasReport {
  const summary = buildSummary(input);
  const rankings = buildRankings(input.buckets);
  const warnings = buildWarnings({
    buckets: input.buckets,
    config: input.config,
  });

  return {
    generatedAt: input.generatedAt,
    inputRoot: input.inputRoot,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    mispricingAtlasPath: input.mispricingAtlasPath,
    config: input.config,
    summary,
    buckets: input.buckets,
    rankings,
    warnings,
  };
}

export function summarizeTradeabilityForStdout(
  summary: CostAwareAtlasSummary,
): Record<string, number | string> {
  const tradeabilitySummary = Object.fromEntries(
    COST_AWARE_TRADEABILITY_ORDER.map((classification) => [
      classification,
      summary.tradeabilityCounts[classification],
    ]),
  );

  return {
    totalBuckets: summary.totalBuckets,
    nonEmptyBuckets: summary.nonEmptyBuckets,
    tradeablePositiveBuckets: summary.tradeablePositiveBuckets,
    grossOnlyBuckets: summary.grossOnlyBuckets,
    untradeableBuckets: summary.untradeableBuckets,
    underpoweredBuckets: summary.underpoweredBuckets,
    ...tradeabilitySummary,
  };
}
