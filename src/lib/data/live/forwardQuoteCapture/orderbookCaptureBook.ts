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
import {
  FORWARD_CAPTURE_PRICE_REPRESENTATION,
  type ForwardCapturePriceRepresentation,
  type ForwardTopOfBookBookState,
  type ForwardTopOfBookRecord,
} from "./forwardQuoteCaptureTypes";

/**
 * YES asks / NO asks are derived from opposite-side best bids:
 * yesAsk = 100 - noBid, noAsk = 100 - yesBid.
 * Ask sizes use the opposite-side bid size at the implied ask level.
 *
 * Price representation: legacy no-leg (`use_yes_price: false`). Yes-side
 * levels carry yes-leg prices; no-side levels carry no-leg prices.
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

export type CaptureBookDeltaResult =
  /** Contiguous delta applied to a synchronized book. */
  | "accepted"
  /** Duplicate/out-of-order sequence ignored. */
  | "duplicate"
  /** First discontinuity while synchronized: starts a gap episode. */
  | "gap-initiated"
  /** Delta received while unsynchronized: quarantined, not applied. */
  | "quarantined"
  /** Message for a closed market: ignored entirely. */
  | "closed-ignored";

export type CaptureBookSnapshotResult =
  /** Snapshot applied; book is valid and synchronized. */
  | "applied"
  /** Snapshot older than data already seen on the same sid: rejected. */
  | "stale-rejected"
  /** Snapshot for a closed market: ignored, book stays closed. */
  | "closed-ignored";

export class OrderbookCaptureBook {
  readonly marketTicker: string;
  readonly seriesTicker: string;
  readonly eventTicker: string | null;
  /** Provenance: the representation the capture actually subscribed with. */
  readonly priceRepresentation: ForwardCapturePriceRepresentation;

  yesBids = new Map<number, number>();
  noBids = new Map<number, number>();
  bookState: ForwardTopOfBookBookState = "awaiting-snapshot";
  lastSeq: number | null = null;
  /** Server subscription id (sid) the book is currently synchronized to. */
  currentSid: number | null = null;
  /** Highest sequence observed per active sid (stale-snapshot detection). */
  private highestSeqSeen: number | null = null;

  private readonly sequenceTracker = new SequenceTracker();

  constructor(input: {
    marketTicker: string;
    seriesTicker: string;
    eventTicker?: string | null;
    priceRepresentation?: ForwardCapturePriceRepresentation;
  }) {
    this.marketTicker = input.marketTicker;
    this.seriesTicker = input.seriesTicker;
    this.eventTicker = input.eventTicker ?? null;
    this.priceRepresentation =
      input.priceRepresentation ?? FORWARD_CAPTURE_PRICE_REPRESENTATION;
  }

  markClosed(): void {
    this.bookState = "closed";
  }

  markResyncing(): void {
    if (this.bookState !== "closed") {
      this.bookState = "resyncing";
    }
  }

  isUnsynchronized(): boolean {
    return (
      this.bookState === "awaiting-snapshot"
      || this.bookState === "gap-detected"
      || this.bookState === "resyncing"
    );
  }

  invalidateForRecovery(): void {
    if (this.bookState === "closed") {
      return;
    }

    this.yesBids.clear();
    this.noBids.clear();
    this.sequenceTracker.clear();
    this.lastSeq = null;
    this.currentSid = null;
    this.highestSeqSeen = null;
    this.bookState = "awaiting-snapshot";
  }

  applySnapshot(message: KalshiOrderbookSnapshotMessage): CaptureBookSnapshotResult {
    if (this.bookState === "closed") {
      return "closed-ignored";
    }

    // A snapshot on the same sid must not be older than data already seen:
    // an out-of-date snapshot cannot restore a gapped book.
    if (
      this.currentSid !== null
      && message.sid === this.currentSid
      && this.highestSeqSeen !== null
      && message.seq < this.highestSeqSeen
    ) {
      return "stale-rejected";
    }

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
    this.currentSid = message.sid;
    this.highestSeqSeen = message.seq;
    this.bookState = "valid";
    return "applied";
  }

  applyDelta(message: KalshiOrderbookDeltaMessage): CaptureBookDeltaResult {
    if (this.bookState === "closed") {
      return "closed-ignored";
    }

    // A delta from a different sid than the one the book synchronized to
    // cannot be sequenced against local state; quarantine until a snapshot
    // for the new subscription arrives.
    if (this.currentSid !== null && message.sid !== this.currentSid) {
      if (this.isUnsynchronized()) {
        return "quarantined";
      }
      this.bookState = "gap-detected";
      return "gap-initiated";
    }

    this.trackObservedSeq(message.seq);

    // While unsynchronized (awaiting snapshot, gap detected, or resyncing),
    // deltas are quarantined -- never applied and never re-counted as
    // independent gaps. Only a fresh snapshot restores the book.
    if (this.isUnsynchronized()) {
      return "quarantined";
    }

    const seqResult = this.sequenceTracker.apply(message.seq);
    if (seqResult === "gap") {
      this.bookState = "gap-detected";
      return "gap-initiated";
    }

    if (seqResult === "duplicate") {
      return "duplicate";
    }

    const priceCents = parseKalshiDollarToCents(message.msg.price_dollars);
    if (priceCents === null) {
      this.lastSeq = message.seq;
      return "accepted";
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
    return "accepted";
  }

  private trackObservedSeq(seq: number): void {
    if (this.highestSeqSeen === null || seq > this.highestSeqSeen) {
      this.highestSeqSeen = seq;
    }
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
      priceRepresentation: this.priceRepresentation,
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
