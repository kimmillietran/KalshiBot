import type { FetchProvenance } from "@/lib/data/provenance";
import type { BtcBar1m, KalshiCandle1m } from "@/lib/data/types";
import { observedAtSchema } from "@/lib/data/timestamps";
import type { HistoricalTradingSnapshot } from "@/lib/data/snapshots/types";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }

  return value;
}

function sliceBtcBarsUpToCandle(
  btcBars: readonly BtcBar1m[],
  btcProvenance: readonly FetchProvenance[],
  kalshiCandle: KalshiCandle1m,
): { bars: BtcBar1m[]; provenance: FetchProvenance[] } {
  const cutoff = kalshiCandle.closeTime;
  const bars: BtcBar1m[] = [];
  const provenance: FetchProvenance[] = [];

  for (let index = 0; index < btcBars.length; index += 1) {
    const bar = btcBars[index]!;
    if (bar.closeTime <= cutoff) {
      bars.push(bar);
      provenance.push(btcProvenance[index]!);
    }
  }

  if (bars.length === 0) {
    return {
      bars: [btcBars[0]!],
      provenance: [btcProvenance[0]!],
    };
  }

  return { bars, provenance };
}

function buildExpandedSnapshot(
  snapshot: HistoricalTradingSnapshot,
  candleIndex: number,
): HistoricalTradingSnapshot {
  const currentCandle = snapshot.kalshiCandles[candleIndex]!;
  const kalshiCandles = snapshot.kalshiCandles.slice(0, candleIndex + 1);
  const { bars: btcBars, provenance: btcProvenance } = sliceBtcBarsUpToCandle(
    snapshot.btcBars,
    snapshot.provenance.btcBars,
    currentCandle,
  );
  const isLastCandle = candleIndex === snapshot.kalshiCandles.length - 1;

  return deepFreeze({
    ticker: snapshot.ticker,
    marketWindow: snapshot.marketWindow,
    kalshiCandles,
    btcBars,
    settlement: isLastCandle ? snapshot.settlement : null,
    temporal: {
      eventTime: currentCandle.eventTime,
      collectionTime: snapshot.temporal.collectionTime,
      observedAt: observedAtSchema.parse(currentCandle.closeTime),
    },
    provenance: {
      marketWindow: snapshot.provenance.marketWindow,
      kalshiCandles: snapshot.provenance.kalshiCandles.slice(0, candleIndex + 1),
      btcBars: btcProvenance,
      settlement: isLastCandle ? snapshot.provenance.settlement : null,
    },
  });
}

/**
 * Expands one assembled market snapshot into one replay snapshot per Kalshi candle.
 * Each step exposes prefix candle/BTC history and current-candle pricing via
 * `adaptHistoricalSnapshot` (last candle in the prefix).
 */
export function expandMarketSnapshotsForCandleReplay(
  snapshot: HistoricalTradingSnapshot,
): readonly HistoricalTradingSnapshot[] {
  if (snapshot.kalshiCandles.length === 0) {
    return [snapshot];
  }

  return Object.freeze(
    snapshot.kalshiCandles.map((_, candleIndex) =>
      buildExpandedSnapshot(snapshot, candleIndex),
    ),
  );
}
