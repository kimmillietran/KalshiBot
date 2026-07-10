import { parseKalshiDollarToCents } from "@/features/market-data/pricing";
import {
  kalshiOrderbookDeltaMessageSchema,
  kalshiOrderbookSnapshotMessageSchema,
} from "@/features/market-data/orderbook/schemas";
import {
  isMeaningfulOrderbookLevelSize,
  MIN_EXECUTABLE_BID_SIZE_CONTRACTS,
  shouldRemoveOrderbookLevelSize,
} from "@/lib/data/live/forwardQuoteCapture/orderbookLevelSize";
import { OrderbookCaptureBook } from "@/lib/data/live/forwardQuoteCapture/orderbookCaptureBook";
import { parseRawWsLine } from "@/lib/data/research/orderbookReconstructionAudit/replayRawOrderbookMessages";

import type { ReplayBidSizeState } from "./bidSizeCoverageAuditTypes";

export type ReplayBidSizePoint = {
  marketTicker: string;
  sequence: number | null;
  receivedAtLocal: string;
  bookState: string;
  yesBestBidCents: number | null;
  yesBestBidSize: number | null;
  noBestBidCents: number | null;
  noBestBidSize: number | null;
  hasDustBestBidSize: boolean;
};

export function replayBidSizeState(input: {
  lines: readonly string[];
  maxMessages: number;
  marketTicker?: string | null;
  runId: string;
}): {
  state: ReplayBidSizeState;
  points: ReplayBidSizePoint[];
} {
  const books = new Map<string, OrderbookCaptureBook>();
  const points: ReplayBidSizePoint[] = [];
  let messagesScanned = 0;
  let yesBestBidPricePresentCount = 0;
  let yesBestBidSizePresentCount = 0;
  let noBestBidPricePresentCount = 0;
  let noBestBidSizePresentCount = 0;
  let bestPriceChangedSizeMissingCount = 0;
  let samePriceSizeChangedCount = 0;
  let zeroSizeRemoveLevelCount = 0;
  let dustLevelBestBidCount = 0;

  const lastBest = new Map<
    string,
    { yesPrice: number | null; yesSize: number | null; noPrice: number | null; noSize: number | null }
  >();

  for (const line of input.lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (messagesScanned >= input.maxMessages) {
      break;
    }

    const record = parseRawWsLine(trimmed);
    if (!record?.marketTicker) {
      continue;
    }
    if (input.marketTicker && record.marketTicker !== input.marketTicker) {
      continue;
    }
    messagesScanned += 1;

    const book = books.get(record.marketTicker) ?? new OrderbookCaptureBook({
      marketTicker: record.marketTicker,
      seriesTicker: "REPLAY",
      eventTicker: null,
    });
    books.set(record.marketTicker, book);

    if (record.messageType === "orderbook_snapshot") {
      const parsed = kalshiOrderbookSnapshotMessageSchema.safeParse(record.rawPayload);
      if (!parsed.success) {
        continue;
      }
      book.applySnapshot(parsed.data);
    } else if (record.messageType === "orderbook_delta") {
      const parsed = kalshiOrderbookDeltaMessageSchema.safeParse(record.rawPayload);
      if (!parsed.success) {
        continue;
      }
      const levels = parsed.data.msg.side === "yes" ? book.yesBids : book.noBids;
      const priceCents = parseKalshiDollarToCents(parsed.data.msg.price_dollars);
      const before = priceCents === null ? 0 : (levels.get(priceCents) ?? 0);
      const delta = Number.parseFloat(parsed.data.msg.delta_fp);
      const next = before + delta;
      if (shouldRemoveOrderbookLevelSize(next)) {
        zeroSizeRemoveLevelCount += 1;
      }
      book.applyDelta(parsed.data);
    } else {
      continue;
    }

    const top = book.toTopOfBookRecord({
      runId: input.runId,
      receivedAtLocal: record.receivedAtLocal,
      exchangeTimestampMs: null,
    });

    const hasDust =
      (top.yesBestBidSize !== null
        && top.yesBestBidSize > 0
        && top.yesBestBidSize < MIN_EXECUTABLE_BID_SIZE_CONTRACTS)
      || (top.noBestBidSize !== null
        && top.noBestBidSize > 0
        && top.noBestBidSize < MIN_EXECUTABLE_BID_SIZE_CONTRACTS);
    if (hasDust) {
      dustLevelBestBidCount += 1;
    }

    if (top.yesBestBidCents !== null) {
      yesBestBidPricePresentCount += 1;
    }
    if (top.yesBestBidSize !== null && isMeaningfulOrderbookLevelSize(top.yesBestBidSize)) {
      yesBestBidSizePresentCount += 1;
    }
    if (top.noBestBidCents !== null) {
      noBestBidPricePresentCount += 1;
    }
    if (top.noBestBidSize !== null && isMeaningfulOrderbookLevelSize(top.noBestBidSize)) {
      noBestBidSizePresentCount += 1;
    }

    const prev = lastBest.get(record.marketTicker) ?? {
      yesPrice: null,
      yesSize: null,
      noPrice: null,
      noSize: null,
    };
    if (prev.yesPrice !== top.yesBestBidCents && top.yesBestBidCents !== null && top.yesBestBidSize === null) {
      bestPriceChangedSizeMissingCount += 1;
    }
    if (prev.yesPrice === top.yesBestBidCents && prev.yesSize !== top.yesBestBidSize) {
      samePriceSizeChangedCount += 1;
    }
    lastBest.set(record.marketTicker, {
      yesPrice: top.yesBestBidCents,
      yesSize: top.yesBestBidSize,
      noPrice: top.noBestBidCents,
      noSize: top.noBestBidSize,
    });

    points.push({
      marketTicker: record.marketTicker,
      sequence: top.sequence,
      receivedAtLocal: record.receivedAtLocal,
      bookState: top.bookState,
      yesBestBidCents: top.yesBestBidCents,
      yesBestBidSize: top.yesBestBidSize,
      noBestBidCents: top.noBestBidCents,
      noBestBidSize: top.noBestBidSize,
      hasDustBestBidSize: hasDust,
    });
  }

  const replayBidSizeCoverageShare =
    points.length > 0
      ? points.filter(
          (point) =>
            point.yesBestBidSize !== null
            && point.noBestBidSize !== null
            && isMeaningfulOrderbookLevelSize(point.yesBestBidSize)
            && isMeaningfulOrderbookLevelSize(point.noBestBidSize),
        ).length / points.length
      : null;

  return {
    state: {
      replayPointsEmitted: points.length,
      yesBestBidPricePresentCount,
      yesBestBidSizePresentCount,
      noBestBidPricePresentCount,
      noBestBidSizePresentCount,
      bestPriceChangedSizeMissingCount,
      samePriceSizeChangedCount,
      zeroSizeRemoveLevelCount,
      dustLevelBestBidCount,
      replayBidSizeCoverageShare,
    },
    points,
  };
}
