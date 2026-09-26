/**
 * CryptoStruct L2 book replay + sparse BBO emission.
 *
 * Production path uses incremental best-bid/ask pointers (parity-tested against
 * full-map scan). Full-scan helpers remain for tests only.
 */

import { createHash } from "node:crypto";

import {
  CLOCK_POLICY,
  resolveDualTimestamps,
  timestampInDomain,
  type DualTimestamps,
} from "./timingQuality";
import type { ClockDomain, ExecutableQuote } from "./types";

/** Replay implementation identity for cache/checkpoint invalidation. */
export const REPLAY_IMPLEMENTATION_VERSION = "incremental-bbo-v1" as const;

export const BBO_EMISSION_POLICY = "emit-on-bbo-change-v1" as const;

export type ReconstructedBook = {
  bids: Map<number, number>;
  asks: Map<number, number>;
  /** Incremental best pointers — null when side empty. */
  bestBidPrice: number | null;
  bestAskPrice: number | null;
  lastEventId: string | null;
  failClosed: boolean;
};

export function createEmptyBook(): ReconstructedBook {
  return {
    bids: new Map(),
    asks: new Map(),
    bestBidPrice: null,
    bestAskPrice: null,
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

function recomputeBestBid(book: ReconstructedBook): void {
  let best: number | null = null;
  for (const price of book.bids.keys()) {
    if (best === null || price > best) best = price;
  }
  book.bestBidPrice = best;
}

function recomputeBestAsk(book: ReconstructedBook): void {
  let best: number | null = null;
  for (const price of book.asks.keys()) {
    if (best === null || price < best) best = price;
  }
  book.bestAskPrice = best;
}

/** Full-map scan — reference semantics for parity tests. */
export function bestBidFullScan(
  book: Pick<ReconstructedBook, "bids">,
): { price: number; qty: number } | null {
  let best: { price: number; qty: number } | null = null;
  for (const [price, qty] of book.bids) {
    if (!best || price > best.price) best = { price, qty };
  }
  return best;
}

export function bestAskFullScan(
  book: Pick<ReconstructedBook, "asks">,
): { price: number; qty: number } | null {
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

/**
 * Apply L2 tick with incremental best maintenance.
 * Rescan a side only when its current best is deleted/emptied.
 */
export function applyTickToBook(
  book: ReconstructedBook,
  tick: TickEnvelope,
): { chainBreak: boolean; bestRescans: number } {
  const continuity = applyContinuityBreak({
    lastEventId: book.lastEventId,
    prevEventId: tick.prevEventId,
    isSnapshot: Boolean(tick.isSnapshot || tick.msgType === 0),
    failClosed: book.failClosed,
  });
  book.failClosed = continuity.failClosed;
  let bestRescans = 0;
  if (tick.isSnapshot || tick.msgType === 0) {
    book.bids.clear();
    book.asks.clear();
    book.bestBidPrice = null;
    book.bestAskPrice = null;
  }
  if (tick.levels) {
    for (const level of tick.levels) {
      const side = level[0];
      const price = Number(level[1]);
      const qty = Number(level[2]);
      if (!Number.isFinite(price) || !Number.isFinite(qty)) {
        continue;
      }
      const sideMap = side === 0 ? book.bids : book.asks;
      if (qty <= 0) {
        sideMap.delete(price);
        if (side === 0 && book.bestBidPrice === price) {
          recomputeBestBid(book);
          bestRescans += 1;
        }
        if (side === 1 && book.bestAskPrice === price) {
          recomputeBestAsk(book);
          bestRescans += 1;
        }
      } else {
        sideMap.set(price, qty);
        if (side === 0) {
          if (book.bestBidPrice === null || price > book.bestBidPrice) {
            book.bestBidPrice = price;
          }
        } else if (book.bestAskPrice === null || price < book.bestAskPrice) {
          book.bestAskPrice = price;
        }
      }
    }
  }
  book.lastEventId = tick.eventId;
  return { chainBreak: continuity.chainBreak, bestRescans };
}

/**
 * Legacy full-scan apply (no incremental pointers). Used only in parity tests.
 * Mutates a book that may lack reliable best* pointers.
 */
export function applyTickToBookFullScan(
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
    book.bestBidPrice = null;
    book.bestAskPrice = null;
  }
  if (tick.levels) {
    for (const level of tick.levels) {
      const side = level[0];
      const price = Number(level[1]);
      const qty = Number(level[2]);
      if (!Number.isFinite(price) || !Number.isFinite(qty)) continue;
      const sideMap = side === 0 ? book.bids : book.asks;
      if (qty <= 0) sideMap.delete(price);
      else sideMap.set(price, qty);
    }
  }
  book.lastEventId = tick.eventId;
  // Refresh pointers from full scan so bboFromBookFullScan is consistent.
  recomputeBestBid(book);
  recomputeBestAsk(book);
  return { chainBreak: continuity.chainBreak };
}

export function bboFromBook(
  book: ReconstructedBook,
  dual: DualTimestamps,
  chainBreak: boolean,
  domain: ClockDomain = CLOCK_POLICY.decisionClockDomain,
): BboPoint | null {
  if (book.bestBidPrice == null || book.bestAskPrice == null) return null;
  const bidQty = book.bids.get(book.bestBidPrice);
  const askQty = book.asks.get(book.bestAskPrice);
  if (bidQty == null || askQty == null) return null;
  const resolved = resolveDualTimestamps(dual);
  const timestampMs = timestampInDomain(resolved, domain);
  if (timestampMs === null) return null;
  return {
    timestampMs,
    clockDomain: domain,
    timestampSource: domain,
    adapterTimestampMs: resolved.adapterTimestampMs,
    exchangeTimestampMs: resolved.exchangeTimestampMs,
    bid: book.bestBidPrice,
    ask: book.bestAskPrice,
    bidSize: bidQty,
    askSize: askQty,
    mid: (book.bestBidPrice + book.bestAskPrice) / 2,
    chainBreak,
    failClosed: book.failClosed,
  };
}

/** Full-scan BBO (parity reference). */
export function bboFromBookFullScan(
  book: ReconstructedBook,
  dual: DualTimestamps,
  chainBreak: boolean,
  domain: ClockDomain = CLOCK_POLICY.decisionClockDomain,
): BboPoint | null {
  const bid = bestBidFullScan(book);
  const ask = bestAskFullScan(book);
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

/** Emit BBO only when top-of-book changes (sparse emission). */
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

export function hashBookState(book: ReconstructedBook): string {
  const bids = [...book.bids.entries()].sort((a, b) => a[0] - b[0]);
  const asks = [...book.asks.entries()].sort((a, b) => a[0] - b[0]);
  return createHash("sha256")
    .update(JSON.stringify({ bids, asks, failClosed: book.failClosed, lastEventId: book.lastEventId }))
    .digest("hex");
}
