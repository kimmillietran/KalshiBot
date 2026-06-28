import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  HistoricalSnapshotAssemblyError,
  SnapshotAssemblyErrorCode,
} from "./errors";
import type {
  HistoricalTradingSnapshot,
  SnapshotAssemblyInput,
} from "./types";

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

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

/**
 * Assembles a deterministic, serializable historical trading snapshot from
 * normalized Silver records. No calculations, interpolation, or reordering.
 */
export function assembleHistoricalTradingSnapshot(
  input: SnapshotAssemblyInput,
): HistoricalTradingSnapshot {
  if (!input.marketWindow) {
    throw new HistoricalSnapshotAssemblyError(
      SnapshotAssemblyErrorCode.MISSING_MARKET_WINDOW,
    );
  }

  if (!input.kalshiCandles?.length) {
    throw new HistoricalSnapshotAssemblyError(
      SnapshotAssemblyErrorCode.MISSING_KALSHI_CANDLES,
    );
  }

  if (!input.btcBars?.length) {
    throw new HistoricalSnapshotAssemblyError(
      SnapshotAssemblyErrorCode.MISSING_BTC_BARS,
    );
  }

  const { record: marketWindow, provenance: marketProvenance } =
    input.marketWindow;
  const kalshiCandles = input.kalshiCandles.map((entry) => cloneValue(entry.record));
  const kalshiProvenance = input.kalshiCandles.map((entry) =>
    cloneValue(entry.provenance),
  );
  const btcBars = input.btcBars.map((entry) => cloneValue(entry.record));
  const btcProvenance = input.btcBars.map((entry) => cloneValue(entry.provenance));
  const settlement = input.settlement ? cloneValue(input.settlement.record) : null;
  const settlementProvenance = input.settlement
    ? cloneValue(input.settlement.provenance)
    : null;

  return deepFreeze({
    ticker: marketWindow.ticker,
    marketWindow: cloneValue(marketWindow),
    kalshiCandles,
    btcBars,
    settlement,
    temporal: {
      eventTime: marketWindow.eventTime,
      collectionTime: marketWindow.collectionTime,
      observedAt: marketWindow.observedAt,
    },
    provenance: {
      marketWindow: marketProvenance,
      kalshiCandles: kalshiProvenance,
      btcBars: btcProvenance,
      settlement: settlementProvenance,
    },
  });
}

/** Deterministic JSON-like serialization for snapshot comparison and hashing. */
export function serializeHistoricalTradingSnapshot(
  snapshot: HistoricalTradingSnapshot,
): string {
  return stableStringify(snapshot);
}
