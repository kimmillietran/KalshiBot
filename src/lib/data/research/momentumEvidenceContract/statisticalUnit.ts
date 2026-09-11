import type { MomentumIndependentUnitDefinition } from "./momentumEvidenceContractTypes";
import { MomentumEvidenceContractError } from "./momentumEvidenceContractTypes";

export type MomentumCountLadder = {
  rawTobRows: number;
  rawThresholdCrossings: number;
  refractoryDeduplicatedEpisodes: number;
  observableResponses: number;
  executableObservableResponses: number;
  independentMarkets: number;
  independentMarketDays: number;
  effectiveSampleSize: number;
};

export function buildMomentumStatisticalUnitContract(): {
  primaryIndependentUnit: MomentumIndependentUnitDefinition;
  notIndependent: readonly string[];
  dependenceModel: string;
  effectiveSampleSizeRule: string;
  nestedHorizonsNote: string;
  countLadderLabels: readonly (keyof MomentumCountLadder)[];
} {
  return {
    primaryIndependentUnit: "at-most-one-qualifying-episode-per-market-day-per-cell",
    notIndependent: [
      "raw TOB quote rows",
      "raw threshold crossings before refractory dedup",
      "overlapping response-window observations within the same market/day/cell",
      "nested horizon cells of the same event (separate hypotheses, not independent samples of one another)",
    ],
    dependenceModel:
      "Promotion-facing unit = one qualifying episode per marketTicker × UTC calendar day "
      + "× structural cell after refractory dedup and observability filters.",
    effectiveSampleSizeRule:
      "ESS = number of distinct (marketTicker, calendarDay, structuralCell) keys with ≥1 usable "
      + "independent episode. Quote count and raw crossings never substitute for ESS.",
    nestedHorizonsNote:
      "Nested horizon cells are separate hypotheses in the 12-cell universe but do not multiply "
      + "one event's N within a single cell.",
    countLadderLabels: [
      "rawTobRows",
      "rawThresholdCrossings",
      "refractoryDeduplicatedEpisodes",
      "observableResponses",
      "executableObservableResponses",
      "independentMarkets",
      "independentMarketDays",
      "effectiveSampleSize",
    ],
  };
}

export function assertRawQuotesAreNotIndependentN(rawTobRows: number, claimedEss: number): void {
  if (claimedEss === rawTobRows && rawTobRows > 0) {
    throw new MomentumEvidenceContractError(
      "Raw TOB quote count cannot equal claimed effective sample size; quotes are not independent N.",
    );
  }
}

export function assertRawCrossingsAreNotDirectEss(
  rawThresholdCrossings: number,
  claimedEss: number,
): void {
  if (claimedEss === rawThresholdCrossings && rawThresholdCrossings > 0) {
    throw new MomentumEvidenceContractError(
      "Raw threshold crossings cannot become ESS directly; apply refractory dedup + "
        + "market-day/cell capping.",
    );
  }
}

export function computeMomentumEffectiveSampleSize(
  episodes: ReadonlyArray<{
    marketTicker: string;
    calendarDay: string;
    structuralCellId: string;
    usable: boolean;
  }>,
): number {
  const keys = new Set<string>();
  for (const episode of episodes) {
    if (!episode.usable) continue;
    keys.add(`${episode.marketTicker}|${episode.calendarDay}|${episode.structuralCellId}`);
  }
  return keys.size;
}

export function buildMomentumCountLadder(input: MomentumCountLadder): MomentumCountLadder {
  if (input.effectiveSampleSize > input.independentMarketDays) {
    throw new MomentumEvidenceContractError(
      "ESS cannot exceed independent market-days under market-day/cell capping.",
    );
  }
  if (input.effectiveSampleSize > input.refractoryDeduplicatedEpisodes) {
    throw new MomentumEvidenceContractError(
      "ESS cannot exceed refractory-deduplicated episode count.",
    );
  }
  if (input.refractoryDeduplicatedEpisodes > input.rawThresholdCrossings) {
    throw new MomentumEvidenceContractError(
      "Deduplicated episodes cannot exceed raw threshold crossings.",
    );
  }
  assertRawQuotesAreNotIndependentN(input.rawTobRows, input.effectiveSampleSize);
  assertRawCrossingsAreNotDirectEss(input.rawThresholdCrossings, input.effectiveSampleSize);
  return { ...input };
}
