import { parseKalshiDollarToCents } from "@/features/market-data/pricing";
import {
  kalshiOrderbookDeltaMessageSchema,
  kalshiOrderbookSnapshotMessageSchema,
} from "@/features/market-data/orderbook/schemas";
import { classifyTopOfBookEconomicValidity } from "@/lib/data/live/forwardQuoteCapture/classifyTopOfBookEconomicValidity";
import { parseRawWsLine } from "@/lib/data/research/orderbookReconstructionAudit/replayRawOrderbookMessages";

import type {
  ComplementTransformCheck,
  TransformModelId,
  TransformModelMetrics,
} from "./orderbookSemanticsValidationTypes";

export type LadderEvaluationPoint = {
  marketTicker: string;
  receivedAtLocal: string;
  sequence: number | null;
  yesBestBidCents: number | null;
  noBestBidCents: number | null;
  yesBestBidSize: number | null;
  noBestBidSize: number | null;
  lastYesUpdateMs: number | null;
  lastNoUpdateMs: number | null;
  explicitYesAskCents: number | null;
  explicitNoAskCents: number | null;
};

type MarketLadder = {
  yesBids: Map<number, number>;
  noBids: Map<number, number>;
  lastYesUpdateMs: number | null;
  lastNoUpdateMs: number | null;
};

function parseIsoMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
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

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? null;
}

function createEmptyMetrics(modelId: TransformModelId): TransformModelMetrics {
  return {
    modelId,
    recordsEvaluated: 0,
    validRecords: 0,
    crossedRecords: 0,
    lockedRecords: 0,
    missingRecords: 0,
    parityUsableRecords: 0,
    negativeYesSpreadCount: 0,
    negativeNoSpreadCount: 0,
    medianYesSignedSpreadCents: null,
    medianNoSignedSpreadCents: null,
    crossedShare: null,
    parityUsableShare: null,
  };
}

function deriveAsksComplement(
  yesBid: number | null,
  noBid: number | null,
): { yesAsk: number | null; noAsk: number | null } {
  return {
    yesAsk: noBid === null ? null : Math.max(100 - noBid, 0),
    noAsk: yesBid === null ? null : Math.max(100 - yesBid, 0),
  };
}

function evaluateEconomicPoint(input: {
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
  yesBidSize?: number | null;
  noBidSize?: number | null;
}) {
  return classifyTopOfBookEconomicValidity({
    bookState: "valid",
    yesBestBidCents: input.yesBid,
    yesBestAskCents: input.yesAsk,
    noBestBidCents: input.noBid,
    noBestAskCents: input.noAsk,
    yesBestBidSize: input.yesBidSize ?? null,
    yesBestAskSize: input.noBidSize ?? null,
    noBestBidSize: input.noBidSize ?? null,
    noBestAskSize: input.yesBidSize ?? null,
  });
}

function finalizeMetrics(
  metrics: TransformModelMetrics,
  yesSpreads: number[],
  noSpreads: number[],
): TransformModelMetrics {
  return {
    ...metrics,
    medianYesSignedSpreadCents: median(yesSpreads),
    medianNoSignedSpreadCents: median(noSpreads),
    crossedShare:
      metrics.recordsEvaluated > 0
        ? metrics.crossedRecords / metrics.recordsEvaluated
        : null,
    parityUsableShare:
      metrics.recordsEvaluated > 0
        ? metrics.parityUsableRecords / metrics.recordsEvaluated
        : null,
  };
}

export function buildLadderEvaluationPoints(input: {
  lines: readonly string[];
  maxMessages: number;
  marketTicker?: string | null;
}): LadderEvaluationPoint[] {
  const ladders = new Map<string, MarketLadder>();
  const points: LadderEvaluationPoint[] = [];

  let scanned = 0;
  for (const line of input.lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (scanned >= input.maxMessages) {
      break;
    }
    scanned += 1;

    const record = parseRawWsLine(trimmed);
    if (!record?.marketTicker) {
      continue;
    }
    if (input.marketTicker && record.marketTicker !== input.marketTicker) {
      continue;
    }

    const ts = parseIsoMs(record.receivedAtLocal);
    const ladder = ladders.get(record.marketTicker) ?? {
      yesBids: new Map(),
      noBids: new Map(),
      lastYesUpdateMs: null,
      lastNoUpdateMs: null,
    };

    if (record.messageType === "orderbook_snapshot") {
      const parsed = kalshiOrderbookSnapshotMessageSchema.safeParse(record.rawPayload);
      if (!parsed.success) {
        continue;
      }
      ladder.yesBids.clear();
      ladder.noBids.clear();
      for (const [priceDollars, quantityFp] of parsed.data.msg.yes_dollars_fp ?? []) {
        const priceCents = parseKalshiDollarToCents(priceDollars);
        const size = Number.parseFloat(quantityFp);
        if (priceCents !== null && Number.isFinite(size) && size > 0) {
          ladder.yesBids.set(priceCents, size);
        }
      }
      for (const [priceDollars, quantityFp] of parsed.data.msg.no_dollars_fp ?? []) {
        const priceCents = parseKalshiDollarToCents(priceDollars);
        const size = Number.parseFloat(quantityFp);
        if (priceCents !== null && Number.isFinite(size) && size > 0) {
          ladder.noBids.set(priceCents, size);
        }
      }
      if (ts !== null) {
        ladder.lastYesUpdateMs = ts;
        ladder.lastNoUpdateMs = ts;
      }
      ladders.set(record.marketTicker, ladder);
    } else if (record.messageType === "orderbook_delta") {
      const parsed = kalshiOrderbookDeltaMessageSchema.safeParse(record.rawPayload);
      if (!parsed.success) {
        continue;
      }
      const priceCents = parseKalshiDollarToCents(parsed.data.msg.price_dollars);
      if (priceCents === null) {
        continue;
      }
      const levels = parsed.data.msg.side === "yes" ? ladder.yesBids : ladder.noBids;
      const delta = Number.parseFloat(parsed.data.msg.delta_fp);
      const next = (levels.get(priceCents) ?? 0) + delta;
      if (!Number.isFinite(next) || next <= 0) {
        levels.delete(priceCents);
      } else {
        levels.set(priceCents, next);
      }
      if (ts !== null) {
        if (parsed.data.msg.side === "yes") {
          ladder.lastYesUpdateMs = ts;
        } else {
          ladder.lastNoUpdateMs = ts;
        }
      }
      ladders.set(record.marketTicker, ladder);
    } else {
      continue;
    }

    const yesBest = bestBid(ladder.yesBids);
    const noBest = bestBid(ladder.noBids);
    points.push({
      marketTicker: record.marketTicker,
      receivedAtLocal: record.receivedAtLocal,
      sequence: record.sequence,
      yesBestBidCents: yesBest?.priceCents ?? null,
      noBestBidCents: noBest?.priceCents ?? null,
      yesBestBidSize: yesBest?.size ?? null,
      noBestBidSize: noBest?.size ?? null,
      lastYesUpdateMs: ladder.lastYesUpdateMs,
      lastNoUpdateMs: ladder.lastNoUpdateMs,
      explicitYesAskCents: null,
      explicitNoAskCents: null,
    });
  }

  return points;
}

export function compareTransformModels(input: {
  points: readonly LadderEvaluationPoint[];
  freshnessWindowMs: number;
  hasExplicitAskFields: boolean;
}): {
  models: TransformModelMetrics[];
  complementTransform: ComplementTransformCheck;
} {
  const complement = createEmptyMetrics("complement-derived");
  const bidOnly = createEmptyMetrics("bid-only");
  const explicitAsk = createEmptyMetrics("explicit-ask");
  const synchronized = createEmptyMetrics("synchronized-complement");

  const complementYesSpreads: number[] = [];
  const complementNoSpreads: number[] = [];
  const syncYesSpreads: number[] = [];
  const syncNoSpreads: number[] = [];

  const oppositeGaps: number[] = [];
  const staleCrossedOppositeGaps: number[] = [];
  let recordsWithBothBids = 0;
  let yesBidPlusNoBidGreaterThan100Count = 0;
  let yesBidGreaterThanDerivedYesAskCount = 0;
  let noBidGreaterThanDerivedNoAskCount = 0;
  let freshDualSideRecordCount = 0;
  let freshDualSideCrossedCount = 0;
  let staleOppositeSideCrossedCount = 0;

  for (const point of input.points) {
    const { yesBestBidCents: yesBid, noBestBidCents: noBid } = point;
    if (yesBid === null || noBid === null) {
      complement.missingRecords += 1;
      bidOnly.missingRecords += 1;
      synchronized.missingRecords += 1;
      if (input.hasExplicitAskFields) {
        explicitAsk.missingRecords += 1;
      }
      continue;
    }

    recordsWithBothBids += 1;
    const gap =
      point.lastYesUpdateMs !== null && point.lastNoUpdateMs !== null
        ? Math.abs(point.lastYesUpdateMs - point.lastNoUpdateMs)
        : null;
    if (gap !== null) {
      oppositeGaps.push(gap);
    }
    const bothFresh =
      gap !== null && gap <= input.freshnessWindowMs;
    if (bothFresh) {
      freshDualSideRecordCount += 1;
    }

    if (yesBid + noBid > 100) {
      yesBidPlusNoBidGreaterThan100Count += 1;
    }

    const derived = deriveAsksComplement(yesBid, noBid);
    if (yesBid > (derived.yesAsk ?? -1)) {
      yesBidGreaterThanDerivedYesAskCount += 1;
    }
    if (noBid > (derived.noAsk ?? -1)) {
      noBidGreaterThanDerivedNoAskCount += 1;
    }

    // Model A: complement-derived
    complement.recordsEvaluated += 1;
    const complementEconomic = evaluateEconomicPoint({
      yesBid,
      yesAsk: derived.yesAsk,
      noBid,
      noAsk: derived.noAsk,
      yesBidSize: point.yesBestBidSize,
      noBidSize: point.noBestBidSize,
    });
    if (complementEconomic.isEconomicallyValid) {
      complement.validRecords += 1;
    }
    if (complementEconomic.yesBookCrossed || complementEconomic.noBookCrossed) {
      complement.crossedRecords += 1;
      if (bothFresh) {
        freshDualSideCrossedCount += 1;
      } else {
        staleOppositeSideCrossedCount += 1;
        if (gap !== null) {
          staleCrossedOppositeGaps.push(gap);
        }
      }
    }
    if (complementEconomic.yesBookLocked || complementEconomic.noBookLocked) {
      complement.lockedRecords += 1;
    }
    if (complementEconomic.isParityUsable) {
      complement.parityUsableRecords += 1;
    }
    if (
      complementEconomic.yesSignedSpreadCents !== null
      && complementEconomic.yesSignedSpreadCents < 0
    ) {
      complement.negativeYesSpreadCount += 1;
      complementYesSpreads.push(complementEconomic.yesSignedSpreadCents);
    } else if (complementEconomic.yesSignedSpreadCents !== null) {
      complementYesSpreads.push(complementEconomic.yesSignedSpreadCents);
    }
    if (
      complementEconomic.noSignedSpreadCents !== null
      && complementEconomic.noSignedSpreadCents < 0
    ) {
      complement.negativeNoSpreadCount += 1;
      complementNoSpreads.push(complementEconomic.noSignedSpreadCents);
    } else if (complementEconomic.noSignedSpreadCents !== null) {
      complementNoSpreads.push(complementEconomic.noSignedSpreadCents);
    }

    // Model B: bid-only (no derived asks; parity via bid sum)
    bidOnly.recordsEvaluated += 1;
    const bidOnlyValid = yesBid >= 0 && yesBid <= 100 && noBid >= 0 && noBid <= 100;
    if (bidOnlyValid) {
      bidOnly.validRecords += 1;
    }
    if (yesBid + noBid > 100) {
      bidOnly.crossedRecords += 1;
    }
    if (yesBid + noBid === 100) {
      bidOnly.lockedRecords += 1;
    }
    if (bidOnlyValid && yesBid + noBid <= 100) {
      bidOnly.parityUsableRecords += 1;
    }

    // Model C: explicit ask (only if fields exist)
    if (input.hasExplicitAskFields) {
      explicitAsk.recordsEvaluated += 1;
      if (point.explicitYesAskCents === null || point.explicitNoAskCents === null) {
        explicitAsk.missingRecords += 1;
      } else {
        const explicitEconomic = evaluateEconomicPoint({
          yesBid,
          yesAsk: point.explicitYesAskCents,
          noBid,
          noAsk: point.explicitNoAskCents,
          yesBidSize: point.yesBestBidSize,
          noBidSize: point.noBestBidSize,
        });
        if (explicitEconomic.isEconomicallyValid) {
          explicitAsk.validRecords += 1;
        }
        if (explicitEconomic.yesBookCrossed || explicitEconomic.noBookCrossed) {
          explicitAsk.crossedRecords += 1;
        }
        if (explicitEconomic.isParityUsable) {
          explicitAsk.parityUsableRecords += 1;
        }
      }
    }

    // Model D: synchronized complement
    if (!bothFresh) {
      synchronized.missingRecords += 1;
      continue;
    }
    synchronized.recordsEvaluated += 1;
    const syncEconomic = evaluateEconomicPoint({
      yesBid,
      yesAsk: derived.yesAsk,
      noBid,
      noAsk: derived.noAsk,
      yesBidSize: point.yesBestBidSize,
      noBidSize: point.noBestBidSize,
    });
    if (syncEconomic.isEconomicallyValid) {
      synchronized.validRecords += 1;
    }
    if (syncEconomic.yesBookCrossed || syncEconomic.noBookCrossed) {
      synchronized.crossedRecords += 1;
    }
    if (syncEconomic.isParityUsable) {
      synchronized.parityUsableRecords += 1;
    }
    if (syncEconomic.yesSignedSpreadCents !== null) {
      syncYesSpreads.push(syncEconomic.yesSignedSpreadCents);
    }
    if (syncEconomic.noSignedSpreadCents !== null) {
      syncNoSpreads.push(syncEconomic.noSignedSpreadCents);
    }
  }

  const models = [
    finalizeMetrics(complement, complementYesSpreads, complementNoSpreads),
    finalizeMetrics(bidOnly, [], []),
    finalizeMetrics(synchronized, syncYesSpreads, syncNoSpreads),
  ];
  if (input.hasExplicitAskFields) {
    models.push(finalizeMetrics(explicitAsk, [], []));
  }

  return {
    models,
    complementTransform: {
      recordsWithBothBids,
      yesBidPlusNoBidGreaterThan100Count,
      yesBidGreaterThanDerivedYesAskCount,
      noBidGreaterThanDerivedNoAskCount,
      freshDualSideRecordCount,
      freshDualSideCrossedCount,
      staleOppositeSideCrossedCount,
      crossedWhenBothSidesFreshShare:
        freshDualSideRecordCount > 0
          ? freshDualSideCrossedCount / freshDualSideRecordCount
          : null,
      medianOppositeSideGapMs: percentile(
        staleCrossedOppositeGaps.length > 0 ? staleCrossedOppositeGaps : oppositeGaps,
        50,
      ),
      p90OppositeSideGapMs: percentile(
        staleCrossedOppositeGaps.length > 0 ? staleCrossedOppositeGaps : oppositeGaps,
        90,
      ),
    },
  };
}
