import { DataQualityFlag } from "@/lib/data/schemas";
import type {
  BtcBar1m,
  DataQualityFlag as DataQualityFlagType,
  KalshiCandle1m,
  MarketWindow,
} from "@/lib/data/types";
import type { HistoricalTradingSnapshot } from "@/lib/data/snapshots/types";
import {
  MarketLifecycle,
  type EvaluationCandleSnapshot,
  type EvaluationSnapshot,
  type LiquidityQuality,
} from "@/types/domain/trading";

import { ReplayAdaptationError, ReplayAdaptationErrorCode } from "./errors";
import {
  REPLAY_BTC_FEED_STATUS,
  REPLAY_BTC_PROVIDER_SOURCE,
  type HistoricalReplayAdaptation,
} from "./types";

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function midCents(bidCents: number, askCents: number): number {
  return Math.round((bidCents + askCents) / 2);
}

function mapMarketWindowStatus(
  status: MarketWindow["status"],
): (typeof MarketLifecycle)[keyof typeof MarketLifecycle] {
  switch (status) {
    case "open":
      return MarketLifecycle.ACTIVE;
    case "closed":
      return MarketLifecycle.CLOSED;
    case "settled":
      return MarketLifecycle.SETTLED;
  }
}

function resolveLiquidityQuality(
  flags: readonly DataQualityFlagType[],
): LiquidityQuality {
  if (
    flags.includes(DataQualityFlag.MISSING_BID_ASK) ||
    flags.includes(DataQualityFlag.STALE_QUOTE) ||
    flags.includes(DataQualityFlag.SOURCE_DEGRADED)
  ) {
    return "Poor";
  }
  if (
    flags.includes(DataQualityFlag.PARTIAL_WINDOW) ||
    flags.includes(DataQualityFlag.INTERPOLATED)
  ) {
    return "Fair";
  }
  return "Good";
}

function mergeQualityFlags(
  marketWindow: MarketWindow,
  kalshiCandle: KalshiCandle1m,
): DataQualityFlagType[] {
  return [...new Set([...marketWindow.qualityFlags, ...kalshiCandle.qualityFlags])];
}

function mapBtcBarToEvaluationCandle(bar: BtcBar1m): EvaluationCandleSnapshot {
  const timestamp = parseInstant(bar.closeTime);
  if (timestamp === null) {
    throw new ReplayAdaptationError(ReplayAdaptationErrorCode.INVALID_TEMPORAL_ANCHOR);
  }

  return {
    timestamp,
    open: bar.openUsd,
    high: bar.highUsd,
    low: bar.lowUsd,
    close: bar.closeUsd,
  };
}

function buildEvaluationSnapshot(
  snapshot: HistoricalTradingSnapshot,
): EvaluationSnapshot {
  const evaluatedAtMs = parseInstant(snapshot.temporal.observedAt);
  if (evaluatedAtMs === null) {
    throw new ReplayAdaptationError(ReplayAdaptationErrorCode.INVALID_TEMPORAL_ANCHOR);
  }

  if (snapshot.ticker !== snapshot.marketWindow.ticker) {
    throw new ReplayAdaptationError(ReplayAdaptationErrorCode.TICKER_MISMATCH);
  }

  if (!snapshot.kalshiCandles.length) {
    throw new ReplayAdaptationError(ReplayAdaptationErrorCode.MISSING_KALSHI_CANDLES);
  }

  if (!snapshot.btcBars.length) {
    throw new ReplayAdaptationError(ReplayAdaptationErrorCode.MISSING_BTC_BARS);
  }

  const closeTimeMs = parseInstant(snapshot.marketWindow.closeTime);
  if (closeTimeMs === null) {
    throw new ReplayAdaptationError(ReplayAdaptationErrorCode.INVALID_MARKET_CLOSE_TIME);
  }

  const latestKalshiCandle =
    snapshot.kalshiCandles[snapshot.kalshiCandles.length - 1]!;
  const latestBtcBar = snapshot.btcBars[snapshot.btcBars.length - 1]!;
  const qualityFlags = mergeQualityFlags(snapshot.marketWindow, latestKalshiCandle);

  return {
    evaluatedAt: snapshot.temporal.observedAt,
    market: {
      ticker: snapshot.marketWindow.ticker,
      lifecycle: mapMarketWindowStatus(snapshot.marketWindow.status),
      strikePrice: snapshot.marketWindow.strikePriceUsd,
      timeRemainingMs: closeTimeMs - evaluatedAtMs,
      closeTime: snapshot.marketWindow.closeTime,
    },
    btc: {
      price: latestBtcBar.closeUsd,
      change24hPercent: null,
      feedStatus: REPLAY_BTC_FEED_STATUS,
      providerSource: REPLAY_BTC_PROVIDER_SOURCE,
      candles: snapshot.btcBars.map(mapBtcBarToEvaluationCandle),
    },
    pricing: {
      yesBidCents: latestKalshiCandle.yesBidCents,
      yesAskCents: latestKalshiCandle.yesAskCents,
      yesMidCents: midCents(
        latestKalshiCandle.yesBidCents,
        latestKalshiCandle.yesAskCents,
      ),
      noBidCents: latestKalshiCandle.noBidCents,
      noAskCents: latestKalshiCandle.noAskCents,
      noMidCents: midCents(
        latestKalshiCandle.noBidCents,
        latestKalshiCandle.noAskCents,
      ),
      liquidityQuality: resolveLiquidityQuality(qualityFlags),
      volumeDollars: null,
    },
  };
}

/**
 * Adapts an immutable `HistoricalTradingSnapshot` into the engine `EvaluationSnapshot`
 * shape while preserving temporal and provenance metadata for replay orchestration.
 */
export function adaptHistoricalSnapshot(
  snapshot: HistoricalTradingSnapshot,
): HistoricalReplayAdaptation {
  const engineInput = buildEvaluationSnapshot(snapshot);

  return {
    engineInput,
    temporal: {
      eventTime: snapshot.temporal.eventTime,
      collectionTime: snapshot.temporal.collectionTime,
      observedAt: snapshot.temporal.observedAt,
    },
    provenance: {
      marketWindow: snapshot.provenance.marketWindow,
      kalshiCandles: [...snapshot.provenance.kalshiCandles],
      btcBars: [...snapshot.provenance.btcBars],
      settlement: snapshot.provenance.settlement,
    },
    sourceTicker: snapshot.ticker,
    sourceSnapshot: snapshot,
  };
}
