import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { applyRefinementSuggestedFilters } from "@/lib/data/research/hypothesisRobustness/applyRefinementSuggestedFilters";
import { filterObservationsForAtlasBucket } from "@/lib/data/research/hypothesisRobustness/filterObservationsForAtlasBucket";
import { parseAtlasHypothesisCandidateId } from "@/lib/data/research/hypothesisRobustness/parseAtlasHypothesisCandidateId";
import type { HypothesisRefinementFilters } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";
import type { RegimeVolatilityByMarketKey } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import { deriveHypothesisTradeRule } from "@/lib/data/research/hypothesisTradeReplay/deriveHypothesisTradeRule";
import type {
  HypothesisTradeReplayConfig,
  HypothesisTradeReplayEntry,
  ReplayableObservation,
  ReplayTradeAttempt,
} from "@/lib/data/research/hypothesisTradeReplay/hypothesisTradeReplayTypes";
import {
  replayObservationTrade,
  resolveCalibrationError,
} from "@/lib/data/research/hypothesisTradeReplay/replayHypothesisTrades";

import { resolveSideBucket } from "./pnlForensicsGateMath";
import type { PnlForensicsFilledTrade } from "./pnlForensicsGateTypes";

export type RegimeTagLookup = Map<
  string,
  {
    volatility: string | null;
    trend: string | null;
    marketState: string | null;
  }
>;

function filterObservationsForCandidate(
  candidate: HypothesisCandidate,
  observations: readonly ReplayableObservation[],
  regimeVolatilityByMarket: RegimeVolatilityByMarketKey,
): ReplayableObservation[] {
  const refinementRegistration = candidate.refinementRegistration;
  const atlasRef = refinementRegistration
    ? parseAtlasHypothesisCandidateId(refinementRegistration.parentHypothesisId)
    : parseAtlasHypothesisCandidateId(candidate.candidateId);

  if (!atlasRef) {
    return [];
  }

  let bucketObservations = filterObservationsForAtlasBucket(
    observations,
    atlasRef,
    regimeVolatilityByMarket,
  ) as ReplayableObservation[];

  if (refinementRegistration) {
    bucketObservations = applyRefinementSuggestedFilters(
      bucketObservations,
      refinementRegistration.suggestedFilters as HypothesisRefinementFilters,
    ) as ReplayableObservation[];
  }

  return bucketObservations;
}

export function replayHypothesisFilledAttempts(input: {
  candidate: HypothesisCandidate;
  observations: readonly ReplayableObservation[];
  regimeVolatilityByMarket: RegimeVolatilityByMarketKey;
  config: HypothesisTradeReplayConfig;
}): ReplayTradeAttempt[] {
  const tradeRule = deriveHypothesisTradeRule(input.candidate);
  if (!tradeRule) {
    return [];
  }

  const bucketObservations = filterObservationsForCandidate(
    input.candidate,
    input.observations,
    input.regimeVolatilityByMarket,
  );

  const calibrationError = resolveCalibrationError(input.candidate);
  return bucketObservations.map((observation) =>
    replayObservationTrade({
      observation,
      rule: tradeRule,
      config: input.config,
      calibrationError,
    }),
  );
}

function buildMarketJoinKey(observation: ReplayableObservation): string {
  return `${observation.strategyId}/${observation.seriesTicker}/${observation.marketTicker}`;
}

export function mapFilledAttemptToTrade(input: {
  attempt: ReplayTradeAttempt;
  entry: HypothesisTradeReplayEntry;
  regimeTags: RegimeTagLookup;
}): PnlForensicsFilledTrade | null {
  if (input.attempt.status !== "filled" || input.entry.tradeRule == null) {
    return null;
  }

  const observation = input.attempt.observation;
  const joinKey = buildMarketJoinKey(observation);
  const regime = input.regimeTags.get(joinKey);

  return {
    hypothesisId: input.entry.hypothesisId,
    suggestedStrategyFamily: input.entry.candidate.suggestedStrategyFamily ?? null,
    sideBucket: resolveSideBucket(input.entry.tradeRule),
    contractSide: input.entry.tradeRule.side,
    marketTicker: observation.marketTicker,
    marketId: `${observation.strategyId}:${observation.marketTicker}`,
    tradingDayUtc: observation.tradingDayUtc ?? null,
    calendarMonth: observation.calendarMonth ?? null,
    grossPnlCents: input.attempt.grossPnlCents ?? 0,
    netPnlCents: input.attempt.netPnlCents ?? 0,
    entryPriceCents: input.attempt.entryPriceCents ?? 0,
    feeCents: input.attempt.feeCents ?? 0,
    volatilityRegime: observation.volatilityRegime ?? regime?.volatility ?? null,
    trendRegime: regime?.trend ?? null,
    marketState: regime?.marketState ?? null,
  };
}

export function extractFilledTradesForForensics(input: {
  entries: readonly HypothesisTradeReplayEntry[];
  candidates: readonly HypothesisCandidate[];
  observations: readonly ReplayableObservation[];
  regimeVolatilityByMarket: RegimeVolatilityByMarketKey;
  config: HypothesisTradeReplayConfig;
  regimeTags: RegimeTagLookup;
}): PnlForensicsFilledTrade[] {
  const candidateById = new Map(
    input.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const trades: PnlForensicsFilledTrade[] = [];

  for (const entry of input.entries) {
    const candidate = candidateById.get(entry.hypothesisId);
    if (!candidate || entry.metrics.tradeCount === 0) {
      continue;
    }

    const attempts = replayHypothesisFilledAttempts({
      candidate,
      observations: input.observations,
      regimeVolatilityByMarket: input.regimeVolatilityByMarket,
      config: input.config,
    });

    for (const attempt of attempts) {
      const trade = mapFilledAttemptToTrade({
        attempt,
        entry,
        regimeTags: input.regimeTags,
      });
      if (trade) {
        trades.push(trade);
      }
    }
  }

  return trades.sort((left, right) => {
    const hypothesisCompare = left.hypothesisId.localeCompare(right.hypothesisId);
    if (hypothesisCompare !== 0) {
      return hypothesisCompare;
    }

    const marketCompare = left.marketId.localeCompare(right.marketId);
    if (marketCompare !== 0) {
      return marketCompare;
    }

    return (left.tradingDayUtc ?? "").localeCompare(right.tradingDayUtc ?? "");
  });
}

export function buildRegimeTagLookupFromArtifact(
  artifact: unknown,
): RegimeTagLookup {
  const lookup: RegimeTagLookup = new Map();

  if (
    typeof artifact !== "object"
    || artifact === null
    || !("markets" in artifact)
    || !Array.isArray((artifact as { markets: unknown }).markets)
  ) {
    return lookup;
  }

  for (const market of (artifact as { markets: readonly unknown[] }).markets) {
    if (typeof market !== "object" || market === null) {
      continue;
    }

    const record = market as Record<string, unknown>;
    const joinKey = typeof record.joinKey === "string" ? record.joinKey : null;
    const tags = record.tags;
    if (!joinKey || typeof tags !== "object" || tags === null) {
      continue;
    }

    const tagRecord = tags as Record<string, unknown>;
    lookup.set(joinKey, {
      volatility: typeof tagRecord.volatility === "string" ? tagRecord.volatility : null,
      trend: typeof tagRecord.trend === "string" ? tagRecord.trend : null,
      marketState: typeof tagRecord.marketState === "string" ? tagRecord.marketState : null,
    });
  }

  return lookup;
}
