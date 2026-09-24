import type { KalshiTopOfBookBookState } from "@/lib/data/live/kalshiWsCaptureSpike/kalshiWsCaptureSpikeTypes";

export type ReceiptTimedQuote = {
  receivedAtMs: number;
  receivedAtMonoMs: number;
  exchangeTimestampMs: number | null;
  bookState: KalshiTopOfBookBookState;
  yesBidCents: number | null;
  yesBidSize: number | null;
  yesAskCents: number | null;
  yesAskSize: number | null;
  noBidCents: number | null;
  noBidSize: number | null;
  noAskCents: number | null;
  noAskSize: number | null;
  sequence: number | null;
  sequenceGap: boolean;
  reconnectsBefore: number;
};

export type AlignedQuote = {
  available: boolean;
  reason: string | null;
  bookAgeMs: number | null;
  usedFutureQuote: false;
  quote: ReceiptTimedQuote | null;
  missingSize: boolean;
  stale: boolean;
};

export function quoteAsOf(input: {
  quotes: readonly ReceiptTimedQuote[];
  observationReceivedAtMs: number;
  staleAfterMs?: number;
}): AlignedQuote {
  let selected: ReceiptTimedQuote | null = null;
  for (const quote of input.quotes) {
    if (quote.receivedAtMs > input.observationReceivedAtMs) {
      continue;
    }
    if (selected == null || quote.receivedAtMs >= selected.receivedAtMs) {
      selected = quote;
    }
  }
  if (selected == null) {
    return {
      available: false,
      reason: "no-reconstructed-book-received-at-or-before-observation",
      bookAgeMs: null,
      usedFutureQuote: false,
      quote: null,
      missingSize: true,
      stale: false,
    };
  }
  if (selected.bookState !== "valid") {
    return {
      available: false,
      reason: `book-state-${selected.bookState}`,
      bookAgeMs: input.observationReceivedAtMs - selected.receivedAtMs,
      usedFutureQuote: false,
      quote: selected,
      missingSize: selected.yesBidSize == null || selected.noBidSize == null,
      stale: false,
    };
  }
  const bookAgeMs = input.observationReceivedAtMs - selected.receivedAtMs;
  const staleAfterMs = input.staleAfterMs ?? 5_000;
  const missingSize = selected.yesBidSize == null
    || selected.noBidSize == null
    || selected.yesAskSize == null
    || selected.noAskSize == null;
  return {
    available: !missingSize,
    reason: missingSize ? "valid-book-missing-displayed-size" : null,
    bookAgeMs,
    usedFutureQuote: false,
    quote: selected,
    missingSize,
    stale: bookAgeMs > staleAfterMs,
  };
}

export function detectClockAdjustment(input: {
  firstWallMs: number;
  lastWallMs: number;
  firstMonoMs: number;
  lastMonoMs: number;
  toleranceMs?: number;
}): {
  suspected: boolean;
  wallDeltaMs: number;
  monoDeltaMs: number;
  divergenceMs: number;
} {
  const wallDeltaMs = input.lastWallMs - input.firstWallMs;
  const monoDeltaMs = input.lastMonoMs - input.firstMonoMs;
  const divergenceMs = Math.abs(wallDeltaMs - monoDeltaMs);
  return {
    suspected: divergenceMs > (input.toleranceMs ?? 50),
    wallDeltaMs,
    monoDeltaMs,
    divergenceMs,
  };
}

export function compareReceiptOrder(left: { wallMs: number; monoMs: number }, right: { wallMs: number; monoMs: number }): {
  wallOrder: number;
  monoOrder: number;
  consistent: boolean;
} {
  const wallOrder = left.wallMs === right.wallMs ? 0 : left.wallMs < right.wallMs ? -1 : 1;
  const monoOrder = left.monoMs === right.monoMs ? 0 : left.monoMs < right.monoMs ? -1 : 1;
  return {
    wallOrder,
    monoOrder,
    consistent: wallOrder === monoOrder || wallOrder === 0 || monoOrder === 0,
  };
}
