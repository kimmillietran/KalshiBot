import type { CalibrationFadeMarketRecord } from "@/lib/data/research/calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";

import type {
  CandidateMarketAppearance,
  UniqueCandidateMarket,
} from "./calibrationFadeCrossRunValidationTypes";

function parseEntryMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function compareAppearances(
  left: CandidateMarketAppearance,
  right: CandidateMarketAppearance,
): number {
  const timeDelta = parseEntryMs(left.entryTimestamp) - parseEntryMs(right.entryTimestamp);
  if (timeDelta !== 0) {
    return timeDelta;
  }
  return left.selectedRunId.localeCompare(right.selectedRunId);
}

function detectConflicts(
  appearances: readonly CandidateMarketAppearance[],
): string[] {
  const reasons: string[] = [];
  const outcomes = new Set(
    appearances
      .map((entry) => entry.settledOutcome)
      .filter((outcome) => outcome === "yes" || outcome === "no"),
  );
  if (outcomes.size > 1) {
    reasons.push("conflicting-settlement-outcome");
  }

  const sides = new Set(appearances.map((entry) => entry.targetOutcomeSide));
  if (sides.size > 1) {
    reasons.push("conflicting-target-side");
  }

  const hashes = new Set(appearances.map((entry) => entry.hypothesisConfigurationHash));
  if (hashes.size > 1) {
    reasons.push("conflicting-hypothesis-hash");
  }

  return reasons;
}

/** Deduplicates candidate markets across runs using earliest causal entry. */
export function deduplicateCandidateMarkets(input: {
  appearances: readonly {
    market: CalibrationFadeMarketRecord;
    selectedRunId: string;
    selectedRunDirectory: string;
    hypothesisConfigurationHash: string;
    targetOutcomeSide: "yes" | "no";
  }[];
}): {
  appearances: CandidateMarketAppearance[];
  uniqueMarkets: UniqueCandidateMarket[];
  rawCandidateMarketAppearanceCount: number;
  duplicateCandidateAppearanceCount: number;
  uniqueCandidateMarketCount: number;
  conflictingCandidateMarketCount: number;
} {
  const byMarket = new Map<string, CandidateMarketAppearance[]>();

  for (const appearance of input.appearances) {
    const entry: CandidateMarketAppearance = {
      ...appearance.market,
      selectedRunId: appearance.selectedRunId,
      selectedRunDirectory: appearance.selectedRunDirectory,
      hypothesisConfigurationHash: appearance.hypothesisConfigurationHash,
      targetOutcomeSide: appearance.targetOutcomeSide,
      suppressed: false,
      suppressionReason: null,
      conflicting: false,
      conflictReasons: [],
    };
    const list = byMarket.get(entry.marketTicker) ?? [];
    list.push(entry);
    byMarket.set(entry.marketTicker, list);
  }

  const uniqueMarkets: UniqueCandidateMarket[] = [];
  const flattened: CandidateMarketAppearance[] = [];
  let duplicateCandidateAppearanceCount = 0;
  let conflictingCandidateMarketCount = 0;

  const marketTickers = [...byMarket.keys()].sort((left, right) => left.localeCompare(right));
  for (const marketTicker of marketTickers) {
    const group = [...(byMarket.get(marketTicker) ?? [])].sort(compareAppearances);
    const conflictReasons = detectConflicts(group);
    const conflicting = conflictReasons.length > 0;
    if (conflicting) {
      conflictingCandidateMarketCount += 1;
    }

    const resolvedGroup = group.map((entry, index) => {
      if (index === 0) {
        return {
          ...entry,
          suppressed: false,
          suppressionReason: null,
          conflicting,
          conflictReasons,
        };
      }
      duplicateCandidateAppearanceCount += 1;
      return {
        ...entry,
        suppressed: true,
        suppressionReason: conflicting
          ? `suppressed-duplicate-conflicting:${conflictReasons.join(",")}`
          : "suppressed-later-than-earliest-causal-entry",
        conflicting,
        conflictReasons,
      };
    });

    flattened.push(...resolvedGroup);
    uniqueMarkets.push({
      marketTicker,
      selectedCanonicalEntry: resolvedGroup[0]!,
      appearances: resolvedGroup,
      appearanceCount: resolvedGroup.length,
      sourceRunIds: [...new Set(resolvedGroup.map((entry) => entry.selectedRunId))],
      conflicting,
      conflictReasons,
      evaluated: !conflicting,
    });
  }

  return {
    appearances: flattened,
    uniqueMarkets,
    rawCandidateMarketAppearanceCount: flattened.length,
    duplicateCandidateAppearanceCount,
    uniqueCandidateMarketCount: uniqueMarkets.length,
    conflictingCandidateMarketCount,
  };
}
