/**
 * Optimization prototypes — separate from production ingestion loaders.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import {
  applyTickToBook,
  bboFromBook,
  createEmptyBook,
  parseTickLine,
  shouldEmitBbo,
  type BboPoint,
  type ReconstructedBook,
  type TickEnvelope,
} from "@/lib/data/research/externalBtcDelayedRepricingPilot/bookReplay";
import { CLOCK_POLICY, resolveDualTimestamps, timestampInDomain } from "@/lib/data/research/externalBtcDelayedRepricingPilot/timingQuality";

import { hashBook, hashQuotes, type InstrumentedReplayResult } from "./baselineReplay";
import { emptyStageCounters, type StageCounters } from "./types";

export type IncrementalBook = {
  bids: Map<number, number>;
  asks: Map<number, number>;
  bestBidPrice: number | null;
  bestAskPrice: number | null;
  lastEventId: string | null;
  failClosed: boolean;
};

export function createIncrementalBook(): IncrementalBook {
  return {
    bids: new Map(),
    asks: new Map(),
    bestBidPrice: null,
    bestAskPrice: null,
    lastEventId: null,
    failClosed: false,
  };
}

function recomputeBestBid(book: IncrementalBook): void {
  let best: number | null = null;
  for (const price of book.bids.keys()) {
    if (best === null || price > best) best = price;
  }
  book.bestBidPrice = best;
}

function recomputeBestAsk(book: IncrementalBook): void {
  let best: number | null = null;
  for (const price of book.asks.keys()) {
    if (best === null || price < best) best = price;
  }
  book.bestAskPrice = best;
}

function applyContinuity(
  book: IncrementalBook,
  tick: TickEnvelope,
): { chainBreak: boolean } {
  let chainBreak = false;
  if (
    book.lastEventId !== null
    && tick.prevEventId != null
    && tick.prevEventId !== ""
    && tick.prevEventId !== "0"
    && String(tick.prevEventId) !== String(book.lastEventId)
  ) {
    book.failClosed = true;
    chainBreak = true;
  }
  const isSnapshot = Boolean(tick.isSnapshot || tick.msgType === 0);
  if (isSnapshot) {
    book.failClosed = false;
    book.bids.clear();
    book.asks.clear();
    book.bestBidPrice = null;
    book.bestAskPrice = null;
  }
  return { chainBreak };
}

/**
 * Incremental best maintenance: update pointers on touched prices; full rescan
 * only when the current best is deleted or emptied.
 */
export function applyTickIncremental(
  book: IncrementalBook,
  tick: TickEnvelope,
  counters?: StageCounters,
): { chainBreak: boolean; bestRescans: number } {
  const continuity = applyContinuity(book, tick);
  let bestRescans = 0;
  if (tick.levels) {
    for (const level of tick.levels) {
      const side = level[0];
      const price = Number(level[1]);
      const qty = Number(level[2]);
      if (!Number.isFinite(price) || !Number.isFinite(qty)) continue;
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
      if (counters) counters.bookMutations += 1;
    }
  }
  book.lastEventId = tick.eventId;
  return { chainBreak: continuity.chainBreak, bestRescans };
}

function bboFromIncremental(
  book: IncrementalBook,
  tick: TickEnvelope,
  chainBreak: boolean,
): BboPoint | null {
  if (book.bestBidPrice == null || book.bestAskPrice == null) return null;
  const bidQty = book.bids.get(book.bestBidPrice);
  const askQty = book.asks.get(book.bestAskPrice);
  if (bidQty == null || askQty == null) return null;
  const resolved = resolveDualTimestamps({
    adapterTimestampNs: tick.adapterTimestampNs,
    exchangeTimestampNs: tick.exchangeTimestampNs,
  });
  const timestampMs = timestampInDomain(resolved, CLOCK_POLICY.decisionClockDomain);
  if (timestampMs === null) return null;
  return {
    timestampMs,
    clockDomain: CLOCK_POLICY.decisionClockDomain,
    timestampSource: CLOCK_POLICY.decisionClockDomain,
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

function decompressZstdToString(path: string): { text: string; decompressNs: number } {
  const t0 = process.hrtime.bigint();
  const result = spawnSync("zstd", ["-dc", path], { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`zstd -dc failed: ${result.stderr?.toString("utf8") ?? result.error?.message}`);
  }
  const buf = result.stdout as Buffer;
  return {
    text: buf.toString("utf8"),
    decompressNs: Number(process.hrtime.bigint() - t0),
  };
}

function replayLinesSync(input: {
  lines: readonly string[];
  mode: "full-scan" | "incremental";
  profiled: boolean;
  counters: StageCounters;
}): InstrumentedReplayResult {
  const bookInc = createIncrementalBook();
  const bookProd: ReconstructedBook = createEmptyBook();
  const quotes: BboPoint[] = [];
  let previous: BboPoint | null = null;
  let headerSeen = false;

  for (const line of input.lines) {
    input.counters.linesSeen += 1;
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!headerSeen) {
      headerSeen = true;
      if (trimmed[0] === "{") continue;
    }
    if (trimmed[0] !== "[") continue;

    let tick;
    if (input.profiled) {
      const t = process.hrtime.bigint();
      tick = parseTickLine(trimmed);
      input.counters.jsonParseNs += Number(process.hrtime.bigint() - t);
    } else {
      tick = parseTickLine(trimmed);
    }
    if (!tick) continue;
    input.counters.linesParsed += 1;
    if (tick.msgType !== 0 && tick.msgType !== 1) continue;

    if (input.mode === "incremental") {
      const t = input.profiled ? process.hrtime.bigint() : 0n;
      const { chainBreak, bestRescans } = applyTickIncremental(
        bookInc,
        tick,
        input.counters,
      );
      if (input.profiled) {
        input.counters.bookMutationNs += Number(process.hrtime.bigint() - t);
      }
      input.counters.ticksApplied += 1;
      if (tick.isSnapshot || tick.msgType === 0) input.counters.snapshotsApplied += 1;
      if (chainBreak) input.counters.continuityGaps += 1;
      input.counters.bestScans += bestRescans;

      const tScan = input.profiled ? process.hrtime.bigint() : 0n;
      const bbo = bboFromIncremental(bookInc, tick, chainBreak);
      if (input.profiled) {
        input.counters.bestScanNs += Number(process.hrtime.bigint() - tScan);
      }
      input.counters.bboConstructed += 1;
      if (!bbo) continue;
      if (shouldEmitBbo(previous, bbo)) {
        quotes.push(bbo);
        input.counters.quotesEmitted += 1;
        input.counters.actualBboChanges += 1;
        previous = bbo;
      }
    } else {
      const t = input.profiled ? process.hrtime.bigint() : 0n;
      const { chainBreak } = applyTickToBook(bookProd, tick);
      if (input.profiled) {
        input.counters.bookMutationNs += Number(process.hrtime.bigint() - t);
      }
      input.counters.bookMutations += 1;
      input.counters.ticksApplied += 1;
      if (tick.isSnapshot || tick.msgType === 0) input.counters.snapshotsApplied += 1;
      if (chainBreak) input.counters.continuityGaps += 1;
      const tScan = input.profiled ? process.hrtime.bigint() : 0n;
      const bbo = bboFromBook(
        bookProd,
        {
          adapterTimestampNs: tick.adapterTimestampNs,
          exchangeTimestampNs: tick.exchangeTimestampNs,
        },
        chainBreak,
        CLOCK_POLICY.decisionClockDomain,
      );
      if (input.profiled) {
        input.counters.bestScanNs += Number(process.hrtime.bigint() - tScan);
      }
      input.counters.bestScans += 2;
      input.counters.bboConstructed += 1;
      if (!bbo) continue;
      if (shouldEmitBbo(previous, bbo)) {
        quotes.push(bbo);
        input.counters.quotesEmitted += 1;
        input.counters.actualBboChanges += 1;
        previous = bbo;
      }
    }
  }

  const finalBook = input.mode === "incremental"
    ? {
      bids: bookInc.bids,
      asks: bookInc.asks,
      lastEventId: bookInc.lastEventId,
      failClosed: bookInc.failClosed,
    }
    : bookProd;

  return {
    quotes,
    book: finalBook,
    counters: input.counters,
    decompressedBytes: 0,
    outputHashSha256: hashQuotes(quotes),
    finalBookHashSha256: hashBook(finalBook),
  };
}

export function replaySyncBuffered(input: {
  path: string;
  mode: "full-scan" | "incremental";
  profiled?: boolean;
  hashDuringRead?: boolean;
}): InstrumentedReplayResult & { inputSha256: string } {
  const profiled = input.profiled ?? true;
  const counters = emptyStageCounters();
  const { text, decompressNs } = decompressZstdToString(input.path);
  counters.decompressNs = decompressNs;
  const decompressedBytes = Buffer.byteLength(text, "utf8");

  let inputSha256 = "";
  if (input.hashDuringRead) {
    const t = process.hrtime.bigint();
    // Hash compressed file bytes in same wall window (cheap proxy for "during read")
    // while also hashing decompressed payload once without a second disk pass.
    const compressed = readFileSync(input.path);
    inputSha256 = createHash("sha256").update(compressed).digest("hex");
    counters.hashNs = Number(process.hrtime.bigint() - t);
  } else {
    const t = process.hrtime.bigint();
    inputSha256 = createHash("sha256").update(readFileSync(input.path)).digest("hex");
    counters.hashNs = Number(process.hrtime.bigint() - t);
  }

  const tSplit = process.hrtime.bigint();
  const lines = text.split(/\r?\n/);
  counters.lineSplitNs = Number(process.hrtime.bigint() - tSplit);

  const result = replayLinesSync({
    lines,
    mode: input.mode,
    profiled,
    counters,
  });
  result.decompressedBytes = decompressedBytes;
  return { ...result, inputSha256 };
}

export function replayFromLinesForParity(
  lines: readonly string[],
  mode: "full-scan" | "incremental",
): InstrumentedReplayResult {
  return replayLinesSync({
    lines,
    mode,
    profiled: false,
    counters: emptyStageCounters(),
  });
}
