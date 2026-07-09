import { parseKalshiDollarToCents } from "@/features/market-data/pricing";
import { SequenceTracker } from "@/features/market-data/orderbook/sequenceTracker";
import type {
  KalshiOrderbookDeltaMessage,
  KalshiOrderbookSnapshotMessage,
} from "@/features/market-data/orderbook/types";

import type {
  KalshiTopOfBookBookState,
  KalshiTopOfBookCaptureRecord,
} from "./kalshiWsCaptureSpikeTypes";

function bestBid(
  levels: ReadonlyMap<number, number>,
): { priceCents: number; size: number } | null {
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

/** Minimal cents-based orderbook reconstruction for capture spike. */
export class OrderbookCaptureBook {
  readonly marketTicker: string;
  readonly seriesTicker: string;
  readonly eventTicker: string | null;

  yesBids = new Map<number, number>();
  noBids = new Map<number, number>();
  bookState: KalshiTopOfBookBookState = "awaiting-snapshot";
  lastSeq: number | null = null;

  private readonly sequenceTracker = new SequenceTracker();

  constructor(input: {
    marketTicker: string;
    seriesTicker: string;
    eventTicker?: string | null;
  }) {
    this.marketTicker = input.marketTicker;
    this.seriesTicker = input.seriesTicker;
    this.eventTicker = input.eventTicker ?? null;
  }

  applySnapshot(message: KalshiOrderbookSnapshotMessage): void {
    this.yesBids.clear();
    this.noBids.clear();

    for (const [priceDollars, quantityFp] of message.msg.yes_dollars_fp ?? []) {
      const priceCents = parseKalshiDollarToCents(priceDollars);
      const size = Number.parseFloat(quantityFp);
      if (priceCents !== null && Number.isFinite(size) && size > 0) {
        this.yesBids.set(priceCents, size);
      }
    }

    for (const [priceDollars, quantityFp] of message.msg.no_dollars_fp ?? []) {
      const priceCents = parseKalshiDollarToCents(priceDollars);
      const size = Number.parseFloat(quantityFp);
      if (priceCents !== null && Number.isFinite(size) && size > 0) {
        this.noBids.set(priceCents, size);
      }
    }

    this.sequenceTracker.reset(message.seq);
    this.lastSeq = message.seq;
    this.bookState = "valid";
  }

  applyDelta(message: KalshiOrderbookDeltaMessage): "accepted" | "duplicate" | "gap" {
    const seqResult = this.sequenceTracker.apply(message.seq);
    if (seqResult === "gap") {
      this.bookState = "gap-detected";
      this.lastSeq = message.seq;
      return "gap";
    }

    if (seqResult === "duplicate") {
      return "duplicate";
    }

    if (this.bookState === "awaiting-snapshot") {
      this.bookState = "invalid";
    }

    const priceCents = parseKalshiDollarToCents(message.msg.price_dollars);
    if (priceCents === null) {
      return seqResult;
    }

    const levels = message.msg.side === "yes" ? this.yesBids : this.noBids;
    const current = levels.get(priceCents) ?? 0;
    const delta = Number.parseFloat(message.msg.delta_fp);
    const next = current + delta;

    if (!Number.isFinite(next) || next <= 0) {
      levels.delete(priceCents);
    } else {
      levels.set(priceCents, next);
    }

    this.lastSeq = message.seq;
    if (this.bookState === "gap-detected") {
      return "gap";
    }

    this.bookState = "valid";
    return "accepted";
  }

  toTopOfBookRecord(input: {
    runId: string;
    receivedAtLocal: string;
    exchangeTimestampMs: number | null;
    rawMessageType: string;
  }): KalshiTopOfBookCaptureRecord {
    const yesBest = bestBid(this.yesBids);
    const noBest = bestBid(this.noBids);

    const yesBestBidCents = yesBest?.priceCents ?? null;
    const noBestBidCents = noBest?.priceCents ?? null;
    const yesBestAskCents =
      noBestBidCents === null ? null : Math.max(100 - noBestBidCents, 0);
    const noBestAskCents =
      yesBestBidCents === null ? null : Math.max(100 - yesBestBidCents, 0);

    return {
      runId: input.runId,
      marketTicker: this.marketTicker,
      eventTicker: this.eventTicker,
      seriesTicker: this.seriesTicker,
      receivedAtLocal: input.receivedAtLocal,
      exchangeTimestampMs: input.exchangeTimestampMs,
      sequence: this.lastSeq,
      bookState: this.bookState,
      yesBestBidCents,
      yesBestBidSize: yesBest?.size ?? null,
      yesBestAskCents,
      yesBestAskSize: noBest?.size ?? null,
      noBestBidCents,
      noBestBidSize: noBest?.size ?? null,
      noBestAskCents,
      noBestAskSize: yesBest?.size ?? null,
      yesSpreadCents:
        yesBestBidCents !== null && yesBestAskCents !== null
          ? Math.max(yesBestAskCents - yesBestBidCents, 0)
          : null,
      noSpreadCents:
        noBestBidCents !== null && noBestAskCents !== null
          ? Math.max(noBestAskCents - noBestBidCents, 0)
          : null,
      rawMessageType: input.rawMessageType,
    };
  }
}
