import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";

import {
  BID_ASK_FIDELITY_WARNING_CODE,
  DEFAULT_HIGH_ZERO_SPREAD_THRESHOLD_PERCENT,
  type BidAskFidelityWarning,
  type BidAskSpreadStatistics,
} from "./bidAskFidelityTypes";
import { extractBidAskCandleQuote } from "./extractBidAskCandleQuote";

export const EMPTY_BID_ASK_SPREAD_STATISTICS: BidAskSpreadStatistics = {
  candleCount: 0,
  equalBidAskCount: 0,
  bidLessThanAskCount: 0,
  bidGreaterThanAskCount: 0,
  missingBidAskCount: 0,
  liveCloseOnlyCount: 0,
  minSpreadCents: null,
  averageSpreadCents: null,
  maxSpreadCents: null,
  percentZeroSpread: null,
  percentInvertedSpread: null,
};

function roundPercent(numerator: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }

  return Math.round((numerator / denominator) * 10_000) / 100;
}

function roundAverage(total: number, count: number): number | null {
  if (count === 0) {
    return null;
  }

  return Math.round((total / count) * 100) / 100;
}

/** Computes bid/ask spread statistics for Kalshi candle bronze records. */
export function computeBidAskSpreadStatistics(
  records: readonly RawHistoricalRecord[],
): BidAskSpreadStatistics {
  const candles = records.filter(
    (record) => record.contentType === SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
  );

  if (candles.length === 0) {
    return { ...EMPTY_BID_ASK_SPREAD_STATISTICS };
  }

  let equalBidAskCount = 0;
  let bidLessThanAskCount = 0;
  let bidGreaterThanAskCount = 0;
  let missingBidAskCount = 0;
  let liveCloseOnlyCount = 0;
  let spreadTotal = 0;
  let spreadSampleCount = 0;
  let minSpreadCents: number | null = null;
  let maxSpreadCents: number | null = null;

  for (const candle of candles) {
    const quote = extractBidAskCandleQuote(candle);

    if (quote.source === "missing") {
      missingBidAskCount += 1;
      continue;
    }

    if (quote.source === "live-close-only") {
      liveCloseOnlyCount += 1;
    }

    if (quote.yesBidCents === null || quote.yesAskCents === null) {
      missingBidAskCount += 1;
      continue;
    }

    const spread = quote.yesAskCents - quote.yesBidCents;
    spreadTotal += spread;
    spreadSampleCount += 1;
    minSpreadCents =
      minSpreadCents === null ? spread : Math.min(minSpreadCents, spread);
    maxSpreadCents =
      maxSpreadCents === null ? spread : Math.max(maxSpreadCents, spread);

    if (spread === 0) {
      equalBidAskCount += 1;
    } else if (spread > 0) {
      bidLessThanAskCount += 1;
    } else {
      bidGreaterThanAskCount += 1;
    }
  }

  return {
    candleCount: candles.length,
    equalBidAskCount,
    bidLessThanAskCount,
    bidGreaterThanAskCount,
    missingBidAskCount,
    liveCloseOnlyCount,
    minSpreadCents,
    averageSpreadCents: roundAverage(spreadTotal, spreadSampleCount),
    maxSpreadCents,
    percentZeroSpread: roundPercent(equalBidAskCount, candles.length),
    percentInvertedSpread: roundPercent(bidGreaterThanAskCount, candles.length),
  };
}

export function mergeBidAskSpreadStatistics(
  statistics: readonly BidAskSpreadStatistics[],
): BidAskSpreadStatistics {
  if (statistics.length === 0) {
    return { ...EMPTY_BID_ASK_SPREAD_STATISTICS };
  }

  const merged = statistics.reduce(
    (accumulator, current) => ({
      candleCount: accumulator.candleCount + current.candleCount,
      equalBidAskCount: accumulator.equalBidAskCount + current.equalBidAskCount,
      bidLessThanAskCount:
        accumulator.bidLessThanAskCount + current.bidLessThanAskCount,
      bidGreaterThanAskCount:
        accumulator.bidGreaterThanAskCount + current.bidGreaterThanAskCount,
      missingBidAskCount:
        accumulator.missingBidAskCount + current.missingBidAskCount,
      liveCloseOnlyCount:
        accumulator.liveCloseOnlyCount + current.liveCloseOnlyCount,
      minSpreadCents:
        current.minSpreadCents === null
          ? accumulator.minSpreadCents
          : accumulator.minSpreadCents === null
            ? current.minSpreadCents
            : Math.min(accumulator.minSpreadCents, current.minSpreadCents),
      maxSpreadCents:
        current.maxSpreadCents === null
          ? accumulator.maxSpreadCents
          : accumulator.maxSpreadCents === null
            ? current.maxSpreadCents
            : Math.max(accumulator.maxSpreadCents, current.maxSpreadCents),
      averageSpreadCents: null,
      percentZeroSpread: null,
      percentInvertedSpread: null,
    }),
    { ...EMPTY_BID_ASK_SPREAD_STATISTICS },
  );

  const spreadTotal = statistics.reduce((total, current) => {
    if (current.averageSpreadCents === null) {
      return total;
    }

    const sampleCount =
      current.candleCount - current.missingBidAskCount;
    return total + current.averageSpreadCents * sampleCount;
  }, 0);

  const spreadSampleCount = merged.candleCount - merged.missingBidAskCount;

  return {
    ...merged,
    averageSpreadCents: roundAverage(spreadTotal, spreadSampleCount),
    percentZeroSpread: roundPercent(merged.equalBidAskCount, merged.candleCount),
    percentInvertedSpread: roundPercent(
      merged.bidGreaterThanAskCount,
      merged.candleCount,
    ),
  };
}

export function buildBidAskFidelityWarnings(
  statistics: BidAskSpreadStatistics,
  options?: { highZeroSpreadThresholdPercent?: number },
): BidAskFidelityWarning[] {
  const threshold =
    options?.highZeroSpreadThresholdPercent
    ?? DEFAULT_HIGH_ZERO_SPREAD_THRESHOLD_PERCENT;
  const warnings: BidAskFidelityWarning[] = [];

  if (statistics.candleCount === 0) {
    warnings.push({
      code: BID_ASK_FIDELITY_WARNING_CODE.NO_CANDLES,
      severity: "warning",
      message: "No Kalshi candle records found for bid/ask fidelity analysis",
    });
    return warnings;
  }

  if (statistics.missingBidAskCount > 0) {
    warnings.push({
      code: BID_ASK_FIDELITY_WARNING_CODE.MISSING_BID_ASK_FIELDS,
      severity: "warning",
      message: `${statistics.missingBidAskCount} candle(s) are missing usable YES bid/ask fields`,
    });
  }

  if (statistics.liveCloseOnlyCount === statistics.candleCount) {
    warnings.push({
      code: BID_ASK_FIDELITY_WARNING_CODE.LIVE_CLOSE_ONLY_QUOTES,
      severity: "warning",
      message:
        "All candles use live historical close-only payloads; bid and ask are synthesized as identical values",
    });
  }

  if (statistics.bidGreaterThanAskCount > 0) {
    warnings.push({
      code: BID_ASK_FIDELITY_WARNING_CODE.INVERTED_SPREADS,
      severity: "warning",
      message: `${statistics.bidGreaterThanAskCount} candle(s) have YES bid greater than YES ask`,
    });
  }

  if (statistics.equalBidAskCount === statistics.candleCount) {
    warnings.push({
      code: BID_ASK_FIDELITY_WARNING_CODE.ALL_CANDLES_ZERO_SPREAD,
      severity: "warning",
      message: "All candles have identical YES bid and YES ask (zero spread)",
    });
  } else if (
    statistics.percentZeroSpread !== null
    && statistics.percentZeroSpread >= threshold
  ) {
    warnings.push({
      code: BID_ASK_FIDELITY_WARNING_CODE.HIGH_ZERO_SPREAD,
      severity: "warning",
      message: `${statistics.percentZeroSpread}% of candles have zero YES spread (threshold ${threshold}%)`,
    });
  }

  return warnings;
}

export function isSuspiciousZeroSpreadDataset(
  statistics: BidAskSpreadStatistics,
  warnings: readonly BidAskFidelityWarning[],
): boolean {
  return warnings.some(
    (warning) =>
      warning.code === BID_ASK_FIDELITY_WARNING_CODE.ALL_CANDLES_ZERO_SPREAD
      || warning.code === BID_ASK_FIDELITY_WARNING_CODE.HIGH_ZERO_SPREAD
      || warning.code === BID_ASK_FIDELITY_WARNING_CODE.LIVE_CLOSE_ONLY_QUOTES,
  );
}

/** Convenience helper for fixture/registry integration. */
export function computeBidAskFidelityFromBronzeRecords(
  records: readonly RawHistoricalRecord[],
  options?: { highZeroSpreadThresholdPercent?: number },
) {
  const statistics = computeBidAskSpreadStatistics(records);
  const warnings = buildBidAskFidelityWarnings(statistics, options);

  return {
    statistics,
    warnings,
    suspiciousZeroSpread: isSuspiciousZeroSpreadDataset(statistics, warnings),
  };
}
