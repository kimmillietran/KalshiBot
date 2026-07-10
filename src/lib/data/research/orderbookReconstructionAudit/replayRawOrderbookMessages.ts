import { parseKalshiDollarToCents } from "@/features/market-data/pricing";
import {
  kalshiOrderbookDeltaMessageSchema,
  kalshiOrderbookSnapshotMessageSchema,
} from "@/features/market-data/orderbook/schemas";
import { SequenceTracker } from "@/features/market-data/orderbook/sequenceTracker";
import { classifyTopOfBookEconomicValidity } from "@/lib/data/live/forwardQuoteCapture/classifyTopOfBookEconomicValidity";
import { OrderbookCaptureBook } from "@/lib/data/live/forwardQuoteCapture/orderbookCaptureBook";

export type DeltaSemanticsMode = "relative" | "absolute";

export type ReplayTopOfBookPoint = {
  marketTicker: string;
  sequence: number | null;
  receivedAtLocal: string;
  bookState: string;
  yesBestBidCents: number | null;
  yesBestAskCents: number | null;
  noBestBidCents: number | null;
  noBestAskCents: number | null;
  yesBestBidSize: number | null;
  yesBestAskSize: number | null;
  noBestBidSize: number | null;
  noBestAskSize: number | null;
  economicBookState: string;
  isEconomicallyValid: boolean;
  yesBookCrossed: boolean;
  noBookCrossed: boolean;
};

export type RawWsLine = {
  receivedAtLocal: string;
  messageType: string | null;
  marketTicker: string | null;
  sequence: number | null;
  rawPayload: unknown;
};

type SimpleBidBook = {
  yesBids: Map<number, number>;
  noBids: Map<number, number>;
  bookState: string;
  lastSeq: number | null;
  sequenceTracker: SequenceTracker;
};

function createSimpleBook(): SimpleBidBook {
  return {
    yesBids: new Map(),
    noBids: new Map(),
    bookState: "awaiting-snapshot",
    lastSeq: null,
    sequenceTracker: new SequenceTracker(),
  };
}

function bestBid(levels: ReadonlyMap<number, number>) {
  let best: { priceCents: number; size: number } | null = null;
  for (const [priceCents, size] of levels.entries()) {
    if (size <= 0) {
      continue;
    }
    if (!best || priceCents > best.priceCents) {
      best = { priceCents, size };
    }
  }
  return best;
}

function toReplayPoint(input: {
  marketTicker: string;
  receivedAtLocal: string;
  book: SimpleBidBook;
}): ReplayTopOfBookPoint {
  const yesBest = bestBid(input.book.yesBids);
  const noBest = bestBid(input.book.noBids);
  const yesBestBidCents = yesBest?.priceCents ?? null;
  const noBestBidCents = noBest?.priceCents ?? null;
  const yesBestAskCents =
    noBestBidCents === null ? null : Math.max(100 - noBestBidCents, 0);
  const noBestAskCents =
    yesBestBidCents === null ? null : Math.max(100 - yesBestBidCents, 0);

  const economic = classifyTopOfBookEconomicValidity({
    bookState: input.book.bookState,
    yesBestBidCents,
    yesBestAskCents,
    noBestBidCents,
    noBestAskCents,
    yesBestBidSize: yesBest?.size ?? null,
    yesBestAskSize: noBest?.size ?? null,
    noBestBidSize: noBest?.size ?? null,
    noBestAskSize: yesBest?.size ?? null,
  });

  return {
    marketTicker: input.marketTicker,
    sequence: input.book.lastSeq,
    receivedAtLocal: input.receivedAtLocal,
    bookState: input.book.bookState,
    yesBestBidCents,
    yesBestAskCents,
    noBestBidCents,
    noBestAskCents,
    yesBestBidSize: yesBest?.size ?? null,
    yesBestAskSize: noBest?.size ?? null,
    noBestBidSize: noBest?.size ?? null,
    noBestAskSize: yesBest?.size ?? null,
    economicBookState: economic.economicBookState,
    isEconomicallyValid: economic.isEconomicallyValid,
    yesBookCrossed: economic.yesBookCrossed,
    noBookCrossed: economic.noBookCrossed,
  };
}

function applySnapshotToSimpleBook(
  book: SimpleBidBook,
  message: ReturnType<typeof kalshiOrderbookSnapshotMessageSchema.parse>,
): void {
  book.yesBids.clear();
  book.noBids.clear();

  for (const [priceDollars, quantityFp] of message.msg.yes_dollars_fp ?? []) {
    const priceCents = parseKalshiDollarToCents(priceDollars);
    const size = Number.parseFloat(quantityFp);
    if (priceCents !== null && Number.isFinite(size) && size > 0) {
      book.yesBids.set(priceCents, size);
    }
  }

  for (const [priceDollars, quantityFp] of message.msg.no_dollars_fp ?? []) {
    const priceCents = parseKalshiDollarToCents(priceDollars);
    const size = Number.parseFloat(quantityFp);
    if (priceCents !== null && Number.isFinite(size) && size > 0) {
      book.noBids.set(priceCents, size);
    }
  }

  book.sequenceTracker.reset(message.seq);
  book.lastSeq = message.seq;
  book.bookState = "valid";
}

function applyDeltaToSimpleBook(
  book: SimpleBidBook,
  message: ReturnType<typeof kalshiOrderbookDeltaMessageSchema.parse>,
  semantics: DeltaSemanticsMode,
): void {
  const seqResult = book.sequenceTracker.apply(message.seq);
  if (seqResult === "duplicate") {
    return;
  }

  if (seqResult === "gap" || book.bookState === "awaiting-snapshot") {
    book.bookState = "gap-detected";
    book.lastSeq = message.seq;
    return;
  }

  const priceCents = parseKalshiDollarToCents(message.msg.price_dollars);
  if (priceCents === null) {
    return;
  }

  const levels = message.msg.side === "yes" ? book.yesBids : book.noBids;
  const delta = Number.parseFloat(message.msg.delta_fp);
  const current = levels.get(priceCents) ?? 0;
  const next =
    semantics === "absolute"
      ? delta
      : current + delta;

  if (!Number.isFinite(next) || next <= 0) {
    levels.delete(priceCents);
  } else {
    levels.set(priceCents, next);
  }

  book.lastSeq = message.seq;
  if (book.bookState !== "gap-detected") {
    book.bookState = "valid";
  }
}

export function parseRawWsLine(trimmed: string): RawWsLine | null {
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const rawPayload =
      "rawPayload" in parsed ? parsed.rawPayload : parsed;
    const messageType =
      typeof parsed.messageType === "string"
        ? parsed.messageType
        : typeof rawPayload === "object"
        && rawPayload !== null
        && "type" in rawPayload
        && typeof rawPayload.type === "string"
          ? rawPayload.type
          : null;
    const marketTicker =
      typeof parsed.marketTicker === "string"
        ? parsed.marketTicker
        : null;
    const sequence =
      typeof parsed.sequence === "number"
        ? parsed.sequence
        : typeof rawPayload === "object"
        && rawPayload !== null
        && "seq" in rawPayload
        && typeof rawPayload.seq === "number"
          ? rawPayload.seq
          : null;

    return {
      receivedAtLocal:
        typeof parsed.receivedAtLocal === "string"
          ? parsed.receivedAtLocal
          : new Date(0).toISOString(),
      messageType,
      marketTicker,
      sequence,
      rawPayload,
    };
  } catch {
    return null;
  }
}

export function replayRawOrderbookMessages(input: {
  lines: readonly string[];
  marketTicker?: string | null;
  maxMessages?: number;
  semantics?: DeltaSemanticsMode;
  useCaptureBook?: boolean;
}): {
  replayPoints: ReplayTopOfBookPoint[];
  snapshotLevelChecks: Array<{
    marketTicker: string;
    sequence: number;
    relativeMatches: boolean;
    absoluteMatches: boolean;
  }>;
} {
  const semantics = input.semantics ?? "relative";
  const useCaptureBook = input.useCaptureBook ?? true;
  const books = new Map<string, SimpleBidBook>();
  const captureBooks = new Map<string, OrderbookCaptureBook>();
  const replayPoints: ReplayTopOfBookPoint[] = [];
  const snapshotLevelChecks: Array<{
    marketTicker: string;
    sequence: number;
    relativeMatches: boolean;
    absoluteMatches: boolean;
  }> = [];

  let scanned = 0;
  for (const line of input.lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (input.maxMessages !== undefined && scanned >= input.maxMessages) {
      break;
    }
    scanned += 1;

    const record = parseRawWsLine(trimmed);
    if (!record) {
      continue;
    }

    const payload = record.rawPayload;
    if (record.messageType === "orderbook_snapshot") {
      const parsed = kalshiOrderbookSnapshotMessageSchema.safeParse(payload);
      if (!parsed.success) {
        continue;
      }

      const ticker = parsed.data.msg.market_ticker;
      if (input.marketTicker && ticker !== input.marketTicker) {
        continue;
      }

      const relativeBook = books.get(`${ticker}:relative`) ?? createSimpleBook();
      const absoluteBook = books.get(`${ticker}:absolute`) ?? createSimpleBook();
      applySnapshotToSimpleBook(relativeBook, parsed.data);
      applySnapshotToSimpleBook(absoluteBook, parsed.data);
      books.set(`${ticker}:relative`, relativeBook);
      books.set(`${ticker}:absolute`, absoluteBook);

      if (useCaptureBook) {
        const captureBook = captureBooks.get(ticker)
          ?? new OrderbookCaptureBook({
            marketTicker: ticker,
            seriesTicker: "UNKNOWN",
          });
        captureBook.applySnapshot(parsed.data);
        captureBooks.set(ticker, captureBook);
        const recordOut = captureBook.toTopOfBookRecord({
          runId: "replay",
          receivedAtLocal: record.receivedAtLocal,
          exchangeTimestampMs: null,
        });
        replayPoints.push({
          marketTicker: ticker,
          sequence: recordOut.sequence,
          receivedAtLocal: record.receivedAtLocal,
          bookState: recordOut.bookState,
          yesBestBidCents: recordOut.yesBestBidCents,
          yesBestAskCents: recordOut.yesBestAskCents,
          noBestBidCents: recordOut.noBestBidCents,
          noBestAskCents: recordOut.noBestAskCents,
          yesBestBidSize: recordOut.yesBestBidSize,
          yesBestAskSize: recordOut.yesBestAskSize,
          noBestBidSize: recordOut.noBestBidSize,
          noBestAskSize: recordOut.noBestAskSize,
          economicBookState: recordOut.economicBookState,
          isEconomicallyValid: recordOut.isEconomicallyValid,
          yesBookCrossed: recordOut.yesBookCrossed,
          noBookCrossed: recordOut.noBookCrossed,
        });
      } else {
        const activeBook = semantics === "absolute" ? absoluteBook : relativeBook;
        replayPoints.push(
          toReplayPoint({
            marketTicker: ticker,
            receivedAtLocal: record.receivedAtLocal,
            book: activeBook,
          }),
        );
      }

      continue;
    }

    if (record.messageType === "orderbook_delta") {
      const parsed = kalshiOrderbookDeltaMessageSchema.safeParse(payload);
      if (!parsed.success) {
        continue;
      }

      const ticker = parsed.data.msg.market_ticker;
      if (input.marketTicker && ticker !== input.marketTicker) {
        continue;
      }

      const relativeBook = books.get(`${ticker}:relative`) ?? createSimpleBook();
      const absoluteBook = books.get(`${ticker}:absolute`) ?? createSimpleBook();
      applyDeltaToSimpleBook(relativeBook, parsed.data, "relative");
      applyDeltaToSimpleBook(absoluteBook, parsed.data, "absolute");
      books.set(`${ticker}:relative`, relativeBook);
      books.set(`${ticker}:absolute`, absoluteBook);

      if (useCaptureBook) {
        const captureBook = captureBooks.get(ticker)
          ?? new OrderbookCaptureBook({
            marketTicker: ticker,
            seriesTicker: "UNKNOWN",
          });
        captureBook.applyDelta(parsed.data);
        captureBooks.set(ticker, captureBook);
        const recordOut = captureBook.toTopOfBookRecord({
          runId: "replay",
          receivedAtLocal: record.receivedAtLocal,
          exchangeTimestampMs: parsed.data.msg.ts_ms ?? null,
        });
        replayPoints.push({
          marketTicker: ticker,
          sequence: recordOut.sequence,
          receivedAtLocal: record.receivedAtLocal,
          bookState: recordOut.bookState,
          yesBestBidCents: recordOut.yesBestBidCents,
          yesBestAskCents: recordOut.yesBestAskCents,
          noBestBidCents: recordOut.noBestBidCents,
          noBestAskCents: recordOut.noBestAskCents,
          yesBestBidSize: recordOut.yesBestBidSize,
          yesBestAskSize: recordOut.yesBestAskSize,
          noBestBidSize: recordOut.noBestBidSize,
          noBestAskSize: recordOut.noBestAskSize,
          economicBookState: recordOut.economicBookState,
          isEconomicallyValid: recordOut.isEconomicallyValid,
          yesBookCrossed: recordOut.yesBookCrossed,
          noBookCrossed: recordOut.noBookCrossed,
        });
      } else {
        const activeBook = semantics === "absolute" ? absoluteBook : relativeBook;
        replayPoints.push(
          toReplayPoint({
            marketTicker: ticker,
            receivedAtLocal: record.receivedAtLocal,
            book: activeBook,
          }),
        );
      }
    }
  }

  return { replayPoints, snapshotLevelChecks };
}

export function levelsMatchSnapshot(
  book: SimpleBidBook,
  snapshot: ReturnType<typeof kalshiOrderbookSnapshotMessageSchema.parse>,
): boolean {
  const expectedYes = new Map<number, number>();
  const expectedNo = new Map<number, number>();

  for (const [priceDollars, quantityFp] of snapshot.msg.yes_dollars_fp ?? []) {
    const priceCents = parseKalshiDollarToCents(priceDollars);
    const size = Number.parseFloat(quantityFp);
    if (priceCents !== null && Number.isFinite(size) && size > 0) {
      expectedYes.set(priceCents, size);
    }
  }

  for (const [priceDollars, quantityFp] of snapshot.msg.no_dollars_fp ?? []) {
    const priceCents = parseKalshiDollarToCents(priceDollars);
    const size = Number.parseFloat(quantityFp);
    if (priceCents !== null && Number.isFinite(size) && size > 0) {
      expectedNo.set(priceCents, size);
    }
  }

  const yesMatches = [...expectedYes.entries()].every(
    ([price, size]) => book.yesBids.get(price) === size,
  );
  const noMatches = [...expectedNo.entries()].every(
    ([price, size]) => book.noBids.get(price) === size,
  );

  return yesMatches && noMatches && book.yesBids.size === expectedYes.size
    && book.noBids.size === expectedNo.size;
}
