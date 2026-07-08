import { BID_ASK_FIDELITY_WARNING_CODE } from "@/lib/data/datasets/validation/audit";

import type {
  QuoteFidelitySummary,
  RegistryMarketRecord,
} from "./quoteFidelityGateTypes";

function roundShare(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

function isLegacyBidAskMarket(market: RegistryMarketRecord): boolean {
  const stats = market.bidAskFidelity.statistics;
  return (
    stats.candleCount > 0
    && stats.liveCloseOnlyCount === 0
    && stats.equalBidAskCount < stats.candleCount
  );
}

function isUnknownQuoteFidelityMarket(market: RegistryMarketRecord): boolean {
  const stats = market.bidAskFidelity.statistics;
  return stats.candleCount === 0;
}

function isLiveCloseOnlyMarket(market: RegistryMarketRecord): boolean {
  const stats = market.bidAskFidelity.statistics;
  if (stats.candleCount === 0) {
    return false;
  }

  const hasWarning = market.bidAskFidelity.warnings.some(
    (warning) => warning.code === BID_ASK_FIDELITY_WARNING_CODE.LIVE_CLOSE_ONLY_QUOTES,
  );
  return hasWarning || stats.liveCloseOnlyCount === stats.candleCount;
}

export function analyzeQuoteFidelity(
  markets: readonly RegistryMarketRecord[],
): QuoteFidelitySummary {
  const totalMarkets = markets.length;
  let marketsWithWarnings = 0;
  let liveCloseOnlyCount = 0;
  let zeroSpreadCount = 0;
  let legacyBidAskCount = 0;
  let unknownCount = 0;
  let percentZeroSpreadTotal = 0;
  let percentZeroSpreadSamples = 0;

  for (const market of markets) {
    if (market.bidAskFidelity.warnings.length > 0) {
      marketsWithWarnings += 1;
    }

    if (isLiveCloseOnlyMarket(market)) {
      liveCloseOnlyCount += 1;
    }

    if (market.bidAskFidelity.suspiciousZeroSpread) {
      zeroSpreadCount += 1;
    }

    if (isLegacyBidAskMarket(market)) {
      legacyBidAskCount += 1;
    }

    if (isUnknownQuoteFidelityMarket(market)) {
      unknownCount += 1;
    }

    const percentZeroSpread = market.bidAskFidelity.statistics.percentZeroSpread;
    if (percentZeroSpread !== null) {
      percentZeroSpreadTotal += percentZeroSpread;
      percentZeroSpreadSamples += 1;
    }
  }

  const liveCloseOnlyQuoteShare = roundShare(liveCloseOnlyCount, totalMarkets);
  const zeroSpreadMarketShare = roundShare(zeroSpreadCount, totalMarkets);

  const blockingFields: string[] = [];
  if (liveCloseOnlyQuoteShare >= 0.9) {
    blockingFields.push("live-close-only-quotes");
  }
  if (zeroSpreadMarketShare >= 0.9) {
    blockingFields.push("zero-spread-synthesized-quotes");
  }
  if (legacyBidAskCount === 0) {
    blockingFields.push("no-legacy-real-bid-ask-candles");
  }

  const executableParityResearchFeasible =
    liveCloseOnlyQuoteShare < 0.9
    && zeroSpreadMarketShare < 0.9
    && legacyBidAskCount > 0;
  const executableCrossSpreadResearchFeasible = executableParityResearchFeasible;

  let reason: string;
  if (liveCloseOnlyQuoteShare >= 0.9 || zeroSpreadMarketShare >= 0.9) {
    reason =
      "Historical quotes are live-close-only / zero-spread synthesized from close price.";
  } else if (legacyBidAskCount === 0) {
    reason = "No markets contain legacy real bid/ask candle fields.";
  } else {
    reason = "Executable bid/ask quotes appear present in a meaningful share of markets.";
  }

  return {
    totalMarkets,
    marketsWithBidAskFidelityWarnings: marketsWithWarnings,
    liveCloseOnlyQuoteCount: liveCloseOnlyCount,
    liveCloseOnlyQuoteShare,
    zeroSpreadMarketCount: zeroSpreadCount,
    zeroSpreadMarketShare,
    legacyBidAskCount,
    unknownQuoteFidelityCount: unknownCount,
    percentZeroSpread:
      percentZeroSpreadSamples > 0
        ? Math.round((percentZeroSpreadTotal / percentZeroSpreadSamples) * 100) / 100
        : null,
    executableParityResearchFeasible,
    executableCrossSpreadResearchFeasible,
    reason,
    blockingFields,
  };
}
