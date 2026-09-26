/**
 * Minimal CryptoStruct L2 book replay + BBO emission (memory-bounded: keep book + sparse BBO).
 */

import {
  CLOCK_POLICY,
  resolveDualTimestamps,
  timestampInDomain,
  type DualTimestamps,
} from "./timingQuality";
import type { ClockDomain, ExecutableQuote } from "./types";

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
    if (!best || price > best.price) best = { price, qty };
  }
  return best;
}

function bestAsk(book: ReconstructedBook): { price: number; qty: number } | null {
  let best: { price: number; qty: number } | null = null;
  for (const [price, qty] of book.asks) {
    if (!best || price < best.price) best = { price, qty };
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
  clockDomain: ClockDomain;
  timestampSource: "exchange" | "adapter";
  adapterTimestampMs: number;
  exchangeTimestampMs: number | null;
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
  dual: DualTimestamps,
  chainBreak: boolean,
  domain: ClockDomain = CLOCK_POLICY.decisionClockDomain,
): BboPoint | null {
  const bid = bestBid(book);
  const ask = bestAsk(book);
  if (!bid || !ask) return null;
  const resolved = resolveDualTimestamps(dual);
  const timestampMs = timestampInDomain(resolved, domain);
  if (timestampMs === null) return null;
  return {
    timestampMs,
    clockDomain: domain,
    timestampSource: domain,
    adapterTimestampMs: resolved.adapterTimestampMs,
    exchangeTimestampMs: resolved.exchangeTimestampMs,
    bid: bid.price,
    ask: ask.price,
    bidSize: bid.qty,
    askSize: ask.qty,
    mid: (bid.price + ask.price) / 2,
    chainBreak,
    failClosed: book.failClosed,
  };
}

export function kalshiExecutableFromYesBbo(bbo: BboPoint): ExecutableQuote {
  const yesBidCents = Math.round(bbo.bid * 100);
  const yesAskCents = Math.round(bbo.ask * 100);
  return {
    timestampMs: bbo.timestampMs,
    clockDomain: bbo.clockDomain,
    timestampSource: bbo.timestampSource,
    adapterTimestampMs: bbo.adapterTimestampMs,
    exchangeTimestampMs: bbo.exchangeTimestampMs,
    yesBidCents,
    yesAskCents,
    yesBidSize: bbo.bidSize,
    yesAskSize: bbo.askSize,
    noBidCents: Math.round((1 - bbo.ask) * 100),
    noAskCents: Math.round((1 - bbo.bid) * 100),
    noBidSize: bbo.askSize,
    noAskSize: bbo.bidSize,
    stale: false,
    chainBreak: bbo.chainBreak,
    failClosed: bbo.failClosed,
  };
}

/** Emit BBO only when top-of-book changes (memory bound). */
export function shouldEmitBbo(
  previous: BboPoint | null,
  next: BboPoint,
): boolean {
  if (!previous) return true;
  return (
    previous.bid !== next.bid
    || previous.ask !== next.ask
    || previous.bidSize !== next.bidSize
    || previous.askSize !== next.askSize
    || previous.failClosed !== next.failClosed
    || previous.chainBreak !== next.chainBreak
  );
}

export function parseTickLine(line: string): TickEnvelope | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed[0] !== "[") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length < 6) return null;
  const msgType = parsed[0];
  if (typeof msgType !== "number") return null;
  if (msgType === 5) return null; // instrument state — different shape
  const prevEventId = parsed[2] == null ? null : String(parsed[2]);
  const eventId = String(parsed[3]);
  const adapterTimestampNs = Number(parsed[4]);
  const exchangeTimestampNs = Number(parsed[5] ?? 0);
  if (!Number.isFinite(adapterTimestampNs)) return null;
  const levels = Array.isArray(parsed[6])
    ? (parsed[6] as ReadonlyArray<readonly [number, string, string, number?]>)
    : undefined;
  return {
    msgType,
    prevEventId,
    eventId,
    adapterTimestampNs,
    exchangeTimestampNs: Number.isFinite(exchangeTimestampNs) ? exchangeTimestampNs : 0,
    levels,
    isSnapshot: msgType === 0,
  };
}
