import type {
  KalshiOrderbookDeltaMessage,
  KalshiOrderbookSnapshotMessage,
  OrderbookLevel,
  OrderbookSide,
  OrderbookState,
} from "./types";

function levelsFromRecord(
  record: Readonly<Record<string, string>>,
): OrderbookLevel[] {
  return Object.entries(record)
    .sort(([left], [right]) => Number.parseFloat(left) - Number.parseFloat(right))
    .map(([priceDollars, quantityFp]) => [priceDollars, quantityFp] as OrderbookLevel);
}

function recordFromLevels(levels: readonly OrderbookLevel[] | undefined): Record<string, string> {
  if (!levels) {
    return {};
  }

  const record: Record<string, string> = {};
  for (const [priceDollars, quantityFp] of levels) {
    record[priceDollars] = quantityFp;
  }
  return record;
}

function applyLevelDelta(
  levels: Readonly<Record<string, string>>,
  priceDollars: string,
  deltaFp: string,
): Record<string, string> {
  const current = Number.parseFloat(levels[priceDollars] ?? "0");
  const delta = Number.parseFloat(deltaFp);
  const next = current + delta;
  const updated = { ...levels };

  if (!Number.isFinite(next) || next <= 0) {
    delete updated[priceDollars];
    return updated;
  }

  updated[priceDollars] = next.toFixed(2);
  return updated;
}

export function createEmptyOrderbookState(marketTicker: string): OrderbookState {
  return {
    marketTicker,
    yesLevels: {},
    noLevels: {},
    lastSeq: null,
    updatedAtMs: null,
  };
}

export function applyOrderbookSnapshot(
  state: OrderbookState,
  message: KalshiOrderbookSnapshotMessage,
  nowMs: number,
): OrderbookState {
  return {
    marketTicker: message.msg.market_ticker,
    yesLevels: recordFromLevels(message.msg.yes_dollars_fp),
    noLevels: recordFromLevels(message.msg.no_dollars_fp),
    lastSeq: message.seq,
    updatedAtMs: nowMs,
  };
}

export function applyOrderbookDelta(
  state: OrderbookState,
  message: KalshiOrderbookDeltaMessage,
  nowMs: number,
): OrderbookState {
  const { side, price_dollars: priceDollars, delta_fp: deltaFp } = message.msg;

  return {
    ...state,
    marketTicker: message.msg.market_ticker,
    yesLevels:
      side === "yes"
        ? applyLevelDelta(state.yesLevels, priceDollars, deltaFp)
        : state.yesLevels,
    noLevels:
      side === "no"
        ? applyLevelDelta(state.noLevels, priceDollars, deltaFp)
        : state.noLevels,
    lastSeq: message.seq,
    updatedAtMs: nowMs,
  };
}

export function applyRestOrderbookSnapshot(
  state: OrderbookState,
  ticker: string,
  yesLevels: readonly OrderbookLevel[],
  noLevels: readonly OrderbookLevel[],
  nowMs: number,
): OrderbookState {
  return {
    marketTicker: ticker,
    yesLevels: recordFromLevels(yesLevels),
    noLevels: recordFromLevels(noLevels),
    lastSeq: null,
    updatedAtMs: nowMs,
  };
}

export function orderbookStateToLevels(state: OrderbookState): {
  yesLevels: OrderbookLevel[];
  noLevels: OrderbookLevel[];
} {
  return {
    yesLevels: levelsFromRecord(state.yesLevels),
    noLevels: levelsFromRecord(state.noLevels),
  };
}

export function sideLevels(
  state: OrderbookState,
  side: OrderbookSide,
): Readonly<Record<string, string>> {
  return side === "yes" ? state.yesLevels : state.noLevels;
}
