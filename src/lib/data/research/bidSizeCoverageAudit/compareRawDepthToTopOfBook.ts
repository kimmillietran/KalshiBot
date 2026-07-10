import {
  hasBidSizeFieldPresent,
  hasExecutableBidPairSize,
  MIN_EXECUTABLE_BID_SIZE_CONTRACTS,
} from "@/lib/data/live/forwardQuoteCapture/orderbookLevelSize";

import type {
  SizeMismatchClassification,
  TopOfBookSizeComparisonMetrics,
  TopOfBookSizeComparisonSample,
} from "./bidSizeCoverageAuditTypes";
import type { ReplayBidSizePoint } from "./replayBidSizeState";

export type CapturedTopOfBookSizeRecord = {
  marketTicker: string;
  sequence: number | null;
  receivedAtLocal: string;
  bookState: string;
  yesBestBidCents: number | null;
  yesBestBidSize: number | null;
  noBestBidCents: number | null;
  noBestBidSize: number | null;
  hasYesBidSizeField: boolean;
  hasNoBidSizeField: boolean;
};

function sizeEqual(left: number | null, right: number | null): boolean {
  if (left === null && right === null) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }
  return Math.abs(left - right) < 1e-6;
}

function classifyMismatch(input: {
  captured: CapturedTopOfBookSizeRecord;
  replayed: ReplayBidSizePoint;
}): { classification: SizeMismatchClassification; reason: string } {
  const { captured, replayed } = input;

  if (!captured.hasYesBidSizeField || !captured.hasNoBidSizeField) {
    return {
      classification: "legacy-record-without-size",
      reason: "Top-of-book record missing yesBestBidSize/noBestBidSize fields.",
    };
  }

  const priceMismatch =
    captured.yesBestBidCents !== replayed.yesBestBidCents
    || captured.noBestBidCents !== replayed.noBestBidCents;
  if (priceMismatch) {
    return {
      classification: "price-mismatch",
      reason: "Captured bid prices differ from replayed state at sequence.",
    };
  }

  const sizeMatch =
    sizeEqual(captured.yesBestBidSize, replayed.yesBestBidSize)
    && sizeEqual(captured.noBestBidSize, replayed.noBestBidSize);
  if (sizeMatch) {
    const belowParity =
      !hasExecutableBidPairSize(captured.yesBestBidSize, captured.noBestBidSize);
    if (belowParity) {
      return {
        classification: "fractional-below-parity-min",
        reason: `Sizes emitted but min(yes,no) < ${MIN_EXECUTABLE_BID_SIZE_CONTRACTS} contract parity gate.`,
      };
    }
    return { classification: "match", reason: "Prices and sizes match replay." };
  }

  if (
    replayed.yesBestBidSize !== null
    && replayed.noBestBidSize !== null
    && (captured.yesBestBidSize === null || captured.noBestBidSize === null)
  ) {
    return {
      classification: "emit-size-missing",
      reason: "Replay has bid sizes but captured top-of-book does not.",
    };
  }

  if (
    captured.yesBestBidSize !== null
    && (replayed.yesBestBidSize === null || replayed.noBestBidSize === null)
  ) {
    return {
      classification: "replay-size-missing",
      reason: "Captured top-of-book has sizes but replay state does not.",
    };
  }

  if (!priceMismatch) {
    return {
      classification: "price-match-size-missing",
      reason: "Prices match but bid sizes differ between capture and replay.",
    };
  }

  return { classification: "unknown", reason: "Unclassified size mismatch." };
}

export function indexReplayPoints(
  points: readonly ReplayBidSizePoint[],
): Map<string, ReplayBidSizePoint> {
  const index = new Map<string, ReplayBidSizePoint>();
  for (const point of points) {
    if (point.sequence === null) {
      continue;
    }
    index.set(`${point.marketTicker}:${point.sequence}`, point);
  }
  return index;
}

export function compareRawDepthToTopOfBook(input: {
  captured: readonly CapturedTopOfBookSizeRecord[];
  replayPoints: readonly ReplayBidSizePoint[];
  sampleLimit: number;
}): {
  metrics: TopOfBookSizeComparisonMetrics;
  samples: TopOfBookSizeComparisonSample[];
} {
  const replayIndex = indexReplayPoints(input.replayPoints);
  const samples: TopOfBookSizeComparisonSample[] = [];

  const metrics: TopOfBookSizeComparisonMetrics = {
    topOfBookRecordsCompared: 0,
    sizeMatchCount: 0,
    priceMatchSizeMissingCount: 0,
    priceMismatchCount: 0,
    emitSizeMissingCount: 0,
    replaySizeMissingCount: 0,
    legacyRecordWithoutSizeCount: 0,
    dustLevelSizeCount: 0,
    fractionalBelowParityMinCount: 0,
    topOfBookBidSizePresentCount: 0,
    bidPairWithSizeCount: 0,
    bidPairWithoutSizeCount: 0,
    topOfBookBidSizeCoverageShare: null,
    bidSizeCoverageShare: null,
  };

  let topOfBookRecordsTotal = 0;

  for (const record of input.captured) {
    topOfBookRecordsTotal += 1;

    const hasYesSize = hasBidSizeFieldPresent(record.yesBestBidSize);
    const hasNoSize = hasBidSizeFieldPresent(record.noBestBidSize);
    if (hasYesSize || hasNoSize) {
      metrics.topOfBookBidSizePresentCount += 1;
    }
    if (hasExecutableBidPairSize(record.yesBestBidSize, record.noBestBidSize)) {
      metrics.bidPairWithSizeCount += 1;
    } else if (
      record.yesBestBidCents !== null
      && record.noBestBidCents !== null
      && record.bookState === "valid"
    ) {
      metrics.bidPairWithoutSizeCount += 1;
    }

    if (record.sequence === null) {
      continue;
    }

    const replayed = replayIndex.get(`${record.marketTicker}:${record.sequence}`);
    if (!replayed) {
      continue;
    }

    metrics.topOfBookRecordsCompared += 1;
    const { classification, reason } = classifyMismatch({ captured: record, replayed });

    switch (classification) {
      case "match":
        metrics.sizeMatchCount += 1;
        break;
      case "price-match-size-missing":
        metrics.priceMatchSizeMissingCount += 1;
        break;
      case "price-mismatch":
        metrics.priceMismatchCount += 1;
        break;
      case "emit-size-missing":
        metrics.emitSizeMissingCount += 1;
        break;
      case "replay-size-missing":
        metrics.replaySizeMissingCount += 1;
        break;
      case "legacy-record-without-size":
        metrics.legacyRecordWithoutSizeCount += 1;
        break;
      case "dust-level-size":
        metrics.dustLevelSizeCount += 1;
        break;
      case "fractional-below-parity-min":
        metrics.fractionalBelowParityMinCount += 1;
        break;
      default:
        break;
    }

    if (replayed.hasDustBestBidSize) {
      metrics.dustLevelSizeCount += 1;
    }

    if (
      samples.length < input.sampleLimit
      && (classification !== "match" || samples.length < Math.min(5, input.sampleLimit))
    ) {
      samples.push({
        marketTicker: record.marketTicker,
        sequence: record.sequence,
        receivedAtLocal: record.receivedAtLocal,
        capturedYesBidCents: record.yesBestBidCents,
        capturedYesBidSize: record.yesBestBidSize,
        replayedYesBidCents: replayed.yesBestBidCents,
        replayedYesBidSize: replayed.yesBestBidSize,
        capturedNoBidCents: record.noBestBidCents,
        capturedNoBidSize: record.noBestBidSize,
        replayedNoBidCents: replayed.noBestBidCents,
        replayedNoBidSize: replayed.noBestBidSize,
        classification,
        reason,
      });
    }
  }

  metrics.topOfBookBidSizeCoverageShare =
    topOfBookRecordsTotal > 0
      ? metrics.topOfBookBidSizePresentCount / topOfBookRecordsTotal
      : null;
  metrics.bidSizeCoverageShare =
    topOfBookRecordsTotal > 0
      ? metrics.bidPairWithSizeCount / topOfBookRecordsTotal
      : null;

  return { metrics, samples };
}

export function parseCapturedTopOfBookLine(trimmed: string): CapturedTopOfBookSizeRecord | null {
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.marketTicker !== "string") {
      return null;
    }
    return {
      marketTicker: parsed.marketTicker,
      sequence: typeof parsed.sequence === "number" ? parsed.sequence : null,
      receivedAtLocal:
        typeof parsed.receivedAtLocal === "string"
          ? parsed.receivedAtLocal
          : new Date(0).toISOString(),
      bookState: typeof parsed.bookState === "string" ? parsed.bookState : "unknown",
      yesBestBidCents:
        typeof parsed.yesBestBidCents === "number" ? parsed.yesBestBidCents : null,
      yesBestBidSize:
        typeof parsed.yesBestBidSize === "number" ? parsed.yesBestBidSize : null,
      noBestBidCents:
        typeof parsed.noBestBidCents === "number" ? parsed.noBestBidCents : null,
      noBestBidSize:
        typeof parsed.noBestBidSize === "number" ? parsed.noBestBidSize : null,
      hasYesBidSizeField: "yesBestBidSize" in parsed,
      hasNoBidSizeField: "noBestBidSize" in parsed,
    };
  } catch {
    return null;
  }
}
