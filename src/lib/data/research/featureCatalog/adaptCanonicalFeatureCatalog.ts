import { listUnifiedFeatures } from "@/lib/data/research/features";
import type { UnifiedFeatureCatalogEntry as CanonicalEntry } from "@/lib/data/research/features";
import type { ResearchDimensionId } from "@/lib/data/research/dimensions/types";

import type { UnifiedFeatureCatalogEntry as ExplorerEntry } from "./featureCatalogTypes";

function camelToKebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

const EXPLORER_FEATURE_ID_OVERRIDES: Record<string, string> = {
  predictedProbability: "predicted-probability",
  timeRemainingMs: "time-remaining-ms",
  moneynessPercent: "moneyness-percent",
  annualizedRealizedVolatility: "annualized-volatility",
  momentum15m: "momentum-percent",
  tradingDayUtc: "trading-day-utc",
  timestampMs: "timestamp-ms",
  marketFeatureVector: "trading-features-vector",
};

const EXPLORER_DIMENSION_FEATURE_ID_SUFFIX: Partial<Record<ResearchDimensionId, string>> = {
  coarseProbability: "coarse-probability-dimension",
  coarseProbabilityAxis: "coarse-probability-axis-dimension",
  coarseTimeRemaining: "coarse-time-remaining-dimension",
  hourUtc: "hour-utc-dimension",
  dayOfWeekUtc: "day-of-week-utc-dimension",
  sessionBucket: "session-bucket-dimension",
  weekendFlag: "weekend-flag-dimension",
};

function resolveExplorerFeatureId(
  entry: CanonicalEntry,
  researchDimensionId: ResearchDimensionId | null,
): string {
  if (researchDimensionId) {
    const suffixId = EXPLORER_DIMENSION_FEATURE_ID_SUFFIX[researchDimensionId];
    if (suffixId) {
      return suffixId;
    }
  }

  return EXPLORER_FEATURE_ID_OVERRIDES[entry.id] ?? camelToKebab(entry.id);
}

function canonicalPath(entry: CanonicalEntry): string {
  if (typeof entry.canonicalSource === "object" && "path" in entry.canonicalSource) {
    return entry.canonicalSource.path;
  }

  return entry.id;
}

function mapSourceLayer(entry: CanonicalEntry): ExplorerEntry["sourceLayer"] {
  if (entry.implemented === false) {
    return "missing-indicator";
  }

  if (entry.onMispricingObservation) {
    return "mispricing-observation";
  }

  if (entry.sourceLayer === "trading") {
    return entry.id === "marketFeatureVector" ? "trading-features" : "market-features";
  }

  if (
    entry.linkedResearchDimensionIds
    && entry.linkedResearchDimensionIds.length === 1
    && !entry.onMispricingObservation
    && entry.id !== "observationTimestampMs"
  ) {
    return "research-dimension-derived";
  }

  if (entry.sourceLayer === "regime" || entry.sourceLayer === "aggregate") {
    return "market-features";
  }

  return "market-features";
}

function toExplorerEntry(
  entry: CanonicalEntry,
  researchDimensionId: ResearchDimensionId | null,
): ExplorerEntry {
  return {
    featureId: resolveExplorerFeatureId(entry, researchDimensionId),
    label: entry.displayName,
    sourceLayer: mapSourceLayer(entry),
    canonicalSource: canonicalPath(entry),
    mispricingObservationField: entry.onMispricingObservation
      ? (entry.mispricingObservationField ?? null)
      : null,
    researchDimensionId,
    implemented: entry.implemented !== false,
    duplicationGroupId: entry.duplicationGroupId ?? null,
    notes: entry.description ?? null,
  };
}

/** Expands canonical catalog rows into explorer-facing entries (one row per dimension link). */
export function adaptCanonicalFeatureCatalog(
  canonicalEntries: readonly CanonicalEntry[] = listUnifiedFeatures(),
): readonly ExplorerEntry[] {
  const explorerEntries: ExplorerEntry[] = [];

  for (const entry of canonicalEntries) {
    const dimensionIds = entry.linkedResearchDimensionIds ?? [];

    if (dimensionIds.length === 0) {
      explorerEntries.push(toExplorerEntry(entry, null));
      continue;
    }

    for (const dimensionId of dimensionIds) {
      explorerEntries.push(toExplorerEntry(entry, dimensionId));
    }
  }

  return explorerEntries.sort((left, right) => left.featureId.localeCompare(right.featureId));
}
