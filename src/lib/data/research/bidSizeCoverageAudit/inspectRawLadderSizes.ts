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
import { parseRawWsLine } from "@/lib/data/research/orderbookReconstructionAudit/replayRawOrderbookMessages";

import type { RawLadderSizeInventory } from "./bidSizeCoverageAuditTypes";

function parseSize(value: string): number | null {
  const size = Number.parseFloat(value);
  return Number.isFinite(size) ? size : null;
}

function bestBidFromLadder(
  entries: ReadonlyArray<readonly [string, string]>,
): { priceCents: number; size: number } | null {
  let best: { priceCents: number; size: number } | null = null;
  for (const [priceDollars, quantityFp] of entries) {
    const priceCents = parseKalshiDollarToCents(priceDollars);
    const size = parseSize(quantityFp);
    if (
      priceCents === null
      || size === null
      || !isMeaningfulOrderbookLevelSize(size)
    ) {
      continue;
    }
    if (!best || priceCents > best.priceCents) {
      best = { priceCents, size };
    }
  }
  return best;
}

type SideLadder = Map<number, number>;

function applySnapshotToLadder(
  yesLadder: SideLadder,
  noLadder: SideLadder,
  message: ReturnType<typeof kalshiOrderbookSnapshotMessageSchema.parse>,
): void {
  yesLadder.clear();
  noLadder.clear();
  for (const [priceDollars, quantityFp] of message.msg.yes_dollars_fp ?? []) {
    const priceCents = parseKalshiDollarToCents(priceDollars);
    const size = parseSize(quantityFp);
    if (priceCents !== null && size !== null && isMeaningfulOrderbookLevelSize(size)) {
      yesLadder.set(priceCents, size);
    }
  }
  for (const [priceDollars, quantityFp] of message.msg.no_dollars_fp ?? []) {
    const priceCents = parseKalshiDollarToCents(priceDollars);
    const size = parseSize(quantityFp);
    if (priceCents !== null && size !== null && isMeaningfulOrderbookLevelSize(size)) {
      noLadder.set(priceCents, size);
    }
  }
}

function applyDeltaToLadder(
  ladder: SideLadder,
  priceDollars: string,
  deltaFp: string,
): "removed" | "updated" | "ignored" {
  const priceCents = parseKalshiDollarToCents(priceDollars);
  const delta = parseSize(deltaFp);
  if (priceCents === null || delta === null) {
    return "ignored";
  }
  const next = (ladder.get(priceCents) ?? 0) + delta;
  if (shouldRemoveOrderbookLevelSize(next)) {
    ladder.delete(priceCents);
    return "removed";
  }
  ladder.set(priceCents, next);
  return "updated";
}

function bestBid(levels: SideLadder) {
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

export async function inspectRawLadderSizes(input: {
  lines: AsyncIterable<string>;
  maxMessages: number;
  marketTicker?: string | null;
}): Promise<RawLadderSizeInventory> {
  const yesLadder: SideLadder = new Map();
  const noLadder: SideLadder = new Map();
  let messagesScanned = 0;
  let malformedLineCount = 0;
  let snapshotLadderEntries = 0;
  let deltaUpdates = 0;
  let snapshotEntriesWithSize = 0;
  let deltaEntriesWithSize = 0;
  let yesLadderEntries = 0;
  let yesEntriesWithSize = 0;
  let noLadderEntries = 0;
  let noEntriesWithSize = 0;
  let rawBestBidPricePresentCount = 0;
  let rawBestBidSizePresentCount = 0;
  let rawBestBidSizeZeroCount = 0;
  let rawBestBidSizeNonzeroCount = 0;
  let rawBestBidSizeBelowParityMinCount = 0;

  for await (const line of input.lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (messagesScanned >= input.maxMessages) {
      break;
    }

    const record = parseRawWsLine(trimmed);
    if (!record) {
      malformedLineCount += 1;
      continue;
    }
    if (input.marketTicker && record.marketTicker !== input.marketTicker) {
      continue;
    }
    messagesScanned += 1;

    if (record.messageType === "orderbook_snapshot") {
      const parsed = kalshiOrderbookSnapshotMessageSchema.safeParse(record.rawPayload);
      if (!parsed.success) {
        malformedLineCount += 1;
        continue;
      }
      for (const [, quantityFp] of parsed.data.msg.yes_dollars_fp ?? []) {
        snapshotLadderEntries += 1;
        yesLadderEntries += 1;
        const size = parseSize(quantityFp);
        if (size !== null) {
          snapshotEntriesWithSize += 1;
          yesEntriesWithSize += 1;
        }
      }
      for (const [, quantityFp] of parsed.data.msg.no_dollars_fp ?? []) {
        snapshotLadderEntries += 1;
        noLadderEntries += 1;
        const size = parseSize(quantityFp);
        if (size !== null) {
          snapshotEntriesWithSize += 1;
          noEntriesWithSize += 1;
        }
      }
      applySnapshotToLadder(yesLadder, noLadder, parsed.data);
    } else if (record.messageType === "orderbook_delta") {
      const parsed = kalshiOrderbookDeltaMessageSchema.safeParse(record.rawPayload);
      if (!parsed.success) {
        malformedLineCount += 1;
        continue;
      }
      deltaUpdates += 1;
      const size = parseSize(parsed.data.msg.delta_fp);
      if (size !== null) {
        deltaEntriesWithSize += 1;
      }
      const ladder = parsed.data.msg.side === "yes" ? yesLadder : noLadder;
      applyDeltaToLadder(ladder, parsed.data.msg.price_dollars, parsed.data.msg.delta_fp);
      if (parsed.data.msg.side === "yes") {
        yesLadderEntries += 1;
        if (size !== null) {
          yesEntriesWithSize += 1;
        }
      } else {
        noLadderEntries += 1;
        if (size !== null) {
          noEntriesWithSize += 1;
        }
      }
    }

    const yesBest = bestBid(yesLadder);
    const noBest = bestBid(noLadder);
    if (yesBest || noBest) {
      rawBestBidPricePresentCount += 1;
    }
    for (const best of [yesBest, noBest]) {
      if (!best) {
        continue;
      }
      rawBestBidSizePresentCount += 1;
      if (best.size <= 0 || !isMeaningfulOrderbookLevelSize(best.size)) {
        rawBestBidSizeZeroCount += 1;
      } else {
        rawBestBidSizeNonzeroCount += 1;
        if (best.size < MIN_EXECUTABLE_BID_SIZE_CONTRACTS) {
          rawBestBidSizeBelowParityMinCount += 1;
        }
      }
    }
  }

  return {
    messagesScanned,
    malformedLineCount,
    snapshotLadderEntries,
    deltaUpdates,
    snapshotEntriesWithSize,
    deltaEntriesWithSize,
    yesLadderSizeCoverageShare:
      yesLadderEntries > 0 ? yesEntriesWithSize / yesLadderEntries : null,
    noLadderSizeCoverageShare:
      noLadderEntries > 0 ? noEntriesWithSize / noLadderEntries : null,
    rawBestBidPricePresentCount,
    rawBestBidSizePresentCount,
    rawBestBidSizeZeroCount,
    rawBestBidSizeNonzeroCount,
    rawBestBidSizeBelowParityMinCount,
    notes: [
      "Raw snapshots use yes_dollars_fp/no_dollars_fp [price_dollars, quantity_fp] tuples.",
      "Raw deltas use delta_fp relative quantity changes at price_dollars.",
    ],
  };
}

export { bestBidFromLadder };
