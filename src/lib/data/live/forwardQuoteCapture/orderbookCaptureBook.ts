import { parseKalshiDollarToCents } from "@/features/market-data/pricing";
import { SequenceTracker } from "@/features/market-data/orderbook/sequenceTracker";
import type {
  KalshiOrderbookDeltaMessage,
  KalshiOrderbookSnapshotMessage,
} from "@/features/market-data/orderbook/types";

import { classifyTopOfBookEconomicValidity } from "./classifyTopOfBookEconomicValidity";
import {
  isMeaningfulOrderbookLevelSize,
  shouldRemoveOrderbookLevelSize,
} from "./orderbookLevelSize";
import type {
  ForwardTopOfBookBookState,
  ForwardTopOfBookRecord,
} from "./forwardQuoteCaptureTypes";

/**
 * YES asks / NO asks are derived from opposite-side best bids:
 * yesAsk = 100 - noBid, noAsk = 100 - yesBid.
 * Ask sizes use the opposite-side bid size at the implied ask level.
 */
function bestBid(
  levels: ReadonlyMap<number, number>,
): { priceCents: number; size: number } | null {
  let best: { priceCents: number; size: number } | null = null;

  for (const [priceCents, size] of levels.entries()) {
    if (!isMeaningfulOrderbookLevelSize(size)) {
      continue;
    }

    if (!best || priceCents > best.priceCents) {
      best = { priceCents, size };
    }
  }

  return best;
}

export class OrderbookCaptureBook {
  readonly marketTicker: string;
  readonly seriesTicker: string;
  readonly eventTicker: string | null;

  yesBids = new Map<number, number>();
  noBids = new Map<number, number>();
  bookState: ForwardTopOfBookBookState = "awaiting-snapshot";
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

  markClosed(): void {
    this.bookState = "closed";
  }

  markResyncing(): void {
    if (this.bookState !== "closed") {
      this.bookState = "resyncing";
    }
  }

  invalidateForRecovery(): void {
    if (this.bookState === "closed") {
      return;
    }

    this.yesBids.clear();
    this.noBids.clear();
    this.sequenceTracker.clear();
    this.lastSeq = null;
    this.bookState = "awaiting-snapshot";
  }

  applySnapshot(message: KalshiOrderbookSnapshotMessage): void {
    this.yesBids.clear();
    this.noBids.clear();

    for (const [priceDollars, quantityFp] of message.msg.yes_dollars_fp ?? []) {
      const priceCents = parseKalshiDollarToCents(priceDollars);
      const size = Number.parseFloat(quantityFp);
      if (priceCents !== null && isMeaningfulOrderbookLevelSize(size)) {
        this.yesBids.set(priceCents, size);
      }
    }

    for (const [priceDollars, quantityFp] of message.msg.no_dollars_fp ?? []) {
      const priceCents = parseKalshiDollarToCents(priceDollars);
      const size = Number.parseFloat(quantityFp);
      if (priceCents !== null && isMeaningfulOrderbookLevelSize(size)) {
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
      this.bookState = "gap-detected";
    }

    const priceCents = parseKalshiDollarToCents(message.msg.price_dollars);
    if (priceCents === null) {
      return seqResult;
    }

    const levels = message.msg.side === "yes" ? this.yesBids : this.noBids;
    const current = levels.get(priceCents) ?? 0;
    const delta = Number.parseFloat(message.msg.delta_fp);
    const next = current + delta;

    if (shouldRemoveOrderbookLevelSize(next)) {
      levels.delete(priceCents);
    } else {
      levels.set(priceCents, next);
    }

    this.lastSeq = message.seq;
    if (this.bookState === "gap-detected" || this.bookState === "resyncing") {
      return "gap";
    }

    this.bookState = "valid";
    return "accepted";
  }

  toTopOfBookRecord(input: {
    runId: string;
    receivedAtLocal: string;
    exchangeTimestampMs: number | null;
    btcSpotPriceUsd?: number | null;
    btcSpotReceivedAtLocal?: string | null;
    btcSpotSource?: string | null;
  }): ForwardTopOfBookRecord {
    const yesBest = bestBid(this.yesBids);
    const noBest = bestBid(this.noBids);

    const yesBestBidCents = yesBest?.priceCents ?? null;
    const noBestBidCents = noBest?.priceCents ?? null;
    const yesBestAskCents =
      noBestBidCents === null ? null : Math.max(100 - noBestBidCents, 0);
    const noBestAskCents =
      yesBestBidCents === null ? null : Math.max(100 - yesBestBidCents, 0);

    const yesSignedSpreadCents =
      yesBestBidCents !== null && yesBestAskCents !== null
        ? yesBestAskCents - yesBestBidCents
        : null;
    const noSignedSpreadCents =
      noBestBidCents !== null && noBestAskCents !== null
        ? noBestAskCents - noBestBidCents
        : null;

    const economic = classifyTopOfBookEconomicValidity({
      bookState: this.bookState,
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
        yesSignedSpreadCents !== null
          ? Math.max(yesSignedSpreadCents, 0)
          : null,
      noSpreadCents:
        noSignedSpreadCents !== null
          ? Math.max(noSignedSpreadCents, 0)
          : null,
      yesSignedSpreadCents,
      noSignedSpreadCents,
      economicBookState: economic.economicBookState,
      economicInvalidReasons: economic.economicInvalidReasons,
      isEconomicallyValid: economic.isEconomicallyValid,
      isParityUsable: economic.isParityUsable,
      yesBookCrossed: economic.yesBookCrossed,
      noBookCrossed: economic.noBookCrossed,
      yesBookLocked: economic.yesBookLocked,
      noBookLocked: economic.noBookLocked,
      btcSpotPriceUsd: input.btcSpotPriceUsd ?? null,
      btcSpotReceivedAtLocal: input.btcSpotReceivedAtLocal ?? null,
      btcSpotSource: input.btcSpotSource ?? null,
    };
  }
}
