/**
 * Minimal CryptoStruct L2 YES-book replay for Kalshi prediction contracts
 * and mid construction for Coinbase spot.
 *
 * Continuity + BBO complement rules mirror scripts/research/cryptostructM16AdapterRules.ts
 * without importing from scripts/ into src/.
 */

export type BookLevel = { price: number; qty: number };

function applyContinuityBreak(input: {
  lastEventId: string | null;
  prevEventId: string | null | undefined;
  isSnapshot: boolean;
  failClosed: boolean;
}): { failClosed: boolean; chainBreak: boolean } {
  let { failClosed } = input;
  let chainBreak = false;
  if (
    input.lastEventId !== null
    && input.prevEventId != null
    && input.prevEventId !== ""
    && input.prevEventId !== "0"
    && String(input.prevEventId) !== String(input.lastEventId)
  ) {
    failClosed = true;
    chainBreak = true;
  }
  if (input.isSnapshot) {
    failClosed = false;
  }
  return { failClosed, chainBreak };
}

function bboCentsFromYesBook(
  yesBid: number,
  yesAsk: number,
): {
  yesBidCents: number;
  yesAskCents: number;
  noBidCents: number;
  crossed: boolean;
  locked: boolean;
} {
  const yesBidCents = Math.round(yesBid * 100);
  const yesAskCents = Math.round(yesAsk * 100);
  const noBidCents = Math.round((1 - yesAsk) * 100);
  return {
    yesBidCents,
    yesAskCents,
    noBidCents,
    crossed: yesBid > yesAsk,
    locked: yesBid === yesAsk,
  };
}

export type ReconstructedBook = {
  bids: Map<number, number>;
  asks: Map<number, number>;
  lastEventId: string | null;
  failClosed: boolean;
};

export function createEmptyBook(): ReconstructedBook {
  return {
    bids: new Map(),
    asks: new Map(),
    lastEventId: null,
    failClosed: false,
  };
}

function applyLevels(
  book: ReconstructedBook,
  levels: ReadonlyArray<readonly [number, string, string, number?]>,
): void {
  for (const level of levels) {
    const side = level[0];
    const price = Number(level[1]);
    const qty = Number(level[2]);
    if (!Number.isFinite(price) || !Number.isFinite(qty)) {
      continue;
    }
    const sideMap = side === 0 ? book.bids : book.asks;
    if (qty <= 0) {
      sideMap.delete(price);
    } else {
      sideMap.set(price, qty);
    }
  }
}

function bestBid(book: ReconstructedBook): { price: number; qty: number } | null {
  let best: { price: number; qty: number } | null = null;
  for (const [price, qty] of book.bids) {
    if (!best || price > best.price) {
      best = { price, qty };
    }
  }
  return best;
}

function bestAsk(book: ReconstructedBook): { price: number; qty: number } | null {
  let best: { price: number; qty: number } | null = null;
  for (const [price, qty] of book.asks) {
    if (!best || price < best.price) {
      best = { price, qty };
    }
  }
  return best;
}

export type TickEnvelope = {
  msgType: number;
  prevEventId: string | null;
  eventId: string;
  adapterTimestampNs: number;
  exchangeTimestampNs: number;
  levels?: ReadonlyArray<readonly [number, string, string, number?]>;
  isSnapshot?: boolean;
};

export type BboPoint = {
  timestampMs: number;
  timestampSource: "exchange" | "adapter";
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  mid: number;
  chainBreak: boolean;
  failClosed: boolean;
};

export function applyTickToBook(
  book: ReconstructedBook,
  tick: TickEnvelope,
): { chainBreak: boolean } {
  const continuity = applyContinuityBreak({
    lastEventId: book.lastEventId,
    prevEventId: tick.prevEventId,
    isSnapshot: Boolean(tick.isSnapshot || tick.msgType === 0),
    failClosed: book.failClosed,
  });
  book.failClosed = continuity.failClosed;
  if (tick.isSnapshot || tick.msgType === 0) {
    book.bids.clear();
    book.asks.clear();
  }
  if (tick.levels) {
    applyLevels(book, tick.levels);
  }
  book.lastEventId = tick.eventId;
  return { chainBreak: continuity.chainBreak };
}

export function bboFromBook(
  book: ReconstructedBook,
  timestampMs: number,
  timestampSource: "exchange" | "adapter",
  chainBreak: boolean,
): BboPoint | null {
  const bid = bestBid(book);
  const ask = bestAsk(book);
  if (!bid || !ask) {
    return null;
  }
  return {
    timestampMs,
    timestampSource,
    bid: bid.price,
    ask: ask.price,
    bidSize: bid.qty,
    askSize: ask.qty,
    mid: (bid.price + ask.price) / 2,
    chainBreak,
    failClosed: book.failClosed,
  };
}

/** Kalshi YES prices are in [0,1]; convert to cents BBO with NO complement. */
export function kalshiExecutableFromYesBbo(bbo: BboPoint): {
  yesBidCents: number;
  yesAskCents: number;
  yesBidSize: number;
  yesAskSize: number;
  noBidCents: number;
  noAskCents: number;
  noBidSize: number;
  noAskSize: number;
  crossed: boolean;
  locked: boolean;
} {
  const cents = bboCentsFromYesBook(bbo.bid, bbo.ask);
  return {
    yesBidCents: cents.yesBidCents,
    yesAskCents: cents.yesAskCents,
    yesBidSize: bbo.bidSize,
    yesAskSize: bbo.askSize,
    noBidCents: cents.noBidCents,
    noAskCents: Math.round((1 - bbo.bid) * 100),
    noBidSize: bbo.askSize,
    noAskSize: bbo.bidSize,
    crossed: cents.crossed,
    locked: cents.locked,
  };
}
