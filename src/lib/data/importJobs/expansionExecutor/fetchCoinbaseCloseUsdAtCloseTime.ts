import {
  BtcHistoricalInterval,
  CoinbaseHistoricalHttpAdapter,
  createCoinbaseHistoricalImporter,
} from "@/lib/data/importers/btc";

import type { HistoricalImportFetchLike } from "../bootstrap/historicalImportBootstrapTypes";

import type { CoinbaseCloseAtCloseTimeResult } from "@/lib/data/importers/kalshi/kalshiDerivedExpirationValueTypes";

const ONE_MINUTE_MS = 60_000;
const COINBASE_BTC_USD_SYMBOL = "BTC-USD";

function resolveOneMinuteBarOpenTimeMs(closeTimeMs: number): number {
  return closeMsToMinuteFloor(closeTimeMs) - ONE_MINUTE_MS;
}

function closeMsToMinuteFloor(closeTimeMs: number): number {
  return Math.floor(closeTimeMs / ONE_MINUTE_MS) * ONE_MINUTE_MS;
}

function findOneMinuteCloseBar(
  bars: readonly { openTime: string; closeTime: string; closeUsd: number }[],
  closeTimeMs: number,
): { openTime: string; closeTime: string; closeUsd: number } | null {
  const expectedOpenMs = resolveOneMinuteBarOpenTimeMs(closeTimeMs);
  const expectedOpenTime = new Date(expectedOpenMs).toISOString();

  const exactMatch = bars.find((bar) => bar.openTime === expectedOpenTime);
  if (exactMatch) {
    return exactMatch;
  }

  return (
    bars.find((bar) => {
      const openMs = Date.parse(bar.openTime);
      const barCloseMs = Date.parse(bar.closeTime);
      return (
        Number.isFinite(openMs)
        && Number.isFinite(barCloseMs)
        && openMs <= closeTimeMs
        && barCloseMs >= closeTimeMs
      );
    }) ?? null
  );
}

/** Fetches Coinbase BTC/USD 1m close at the market close_time. */
export async function fetchCoinbaseCloseUsdAtCloseTime(
  closeTime: string,
  fetchImpl: HistoricalImportFetchLike,
): Promise<CoinbaseCloseAtCloseTimeResult | null> {
  const closeTimeMs = Date.parse(closeTime);
  if (!Number.isFinite(closeTimeMs)) {
    return null;
  }

  const barOpenMs = resolveOneMinuteBarOpenTimeMs(closeTimeMs);
  const startTime = new Date(barOpenMs - ONE_MINUTE_MS).toISOString();
  const endTime = new Date(closeTimeMs + ONE_MINUTE_MS).toISOString();

  const httpAdapter = new CoinbaseHistoricalHttpAdapter({ fetchImpl });
  const importer = createCoinbaseHistoricalImporter({
    httpClient: httpAdapter,
  });

  const bars = await importer.getHistoricalBars({
    symbol: COINBASE_BTC_USD_SYMBOL,
    interval: BtcHistoricalInterval.ONE_MINUTE,
    startTime,
    endTime,
  });

  const bar = findOneMinuteCloseBar(bars, closeTimeMs);
  if (
    bar === null
    || !Number.isFinite(bar.closeUsd)
    || bar.closeUsd <= 0
  ) {
    return null;
  }

  return {
    closeUsd: bar.closeUsd,
    sourceTimestamp: bar.closeTime,
  };
}
