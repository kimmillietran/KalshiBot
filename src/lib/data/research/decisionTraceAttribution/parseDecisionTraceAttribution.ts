import type { StrategyDecisionTraceDocument } from "../decisionTrace/strategyDecisionTraceTypes";

import {
  BTC_RETURN_BUCKET_DEFINITIONS,
  resolveCategoricalBucket,
  resolveNumericBucket,
  TIME_REMAINING_BUCKET_DEFINITIONS,
  YES_MID_BUCKET_DEFINITIONS,
} from "./decisionTraceAttributionBuckets";
import {
  DecisionTraceAttributionError,
  DecisionTraceAttributionErrorCode,
  type AttributionObservation,
  type AttributionWarning,
  type ScannedDecisionTrace,
} from "./decisionTraceAttributionTypes";

type ParsedFill = {
  fillId: string;
  priceCents: number;
  quantity: number;
  feeCents: number;
  action: "buy" | "sell";
  side: "yes" | "no";
  sourceStepIndex: number;
  occurredAt: string;
};

type ReplayStepContext = {
  timeRemainingMs: number | null;
  btcReturnPct: number | null;
};

type ClosedTradeAttribution = {
  entrySourceStepIndex: number;
  pnlCents: number;
  fillPriceCents: number;
  isWin: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: unknown, label: string): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new DecisionTraceAttributionError(
        `${label} contains invalid JSON`,
        DecisionTraceAttributionErrorCode.INVALID_JSON,
      );
    }
  }

  return value;
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseTraceDocument(json: string, tracePath: string): StrategyDecisionTraceDocument {
  const parsed = parseJsonValue(json, tracePath);
  if (
    !isRecord(parsed) ||
    typeof parsed.strategyId !== "string" ||
    typeof parsed.marketTicker !== "string" ||
    !Array.isArray(parsed.entries)
  ) {
    throw new DecisionTraceAttributionError(
      `Invalid decision trace document: ${tracePath}`,
      DecisionTraceAttributionErrorCode.INVALID_DOCUMENT,
    );
  }

  return parsed as StrategyDecisionTraceDocument;
}

function parseFill(value: unknown): ParsedFill | null {
  if (!isRecord(value)) {
    return null;
  }

  const fillId = readString(value, "fillId");
  const action = readString(value, "action");
  const side = readString(value, "side");
  const priceCents = readFiniteNumber(value, "priceCents");
  const quantity = readFiniteNumber(value, "quantity");
  const feeCents = readFiniteNumber(value, "feeCents") ?? 0;
  const sourceStepIndex = readFiniteNumber(value, "sourceStepIndex");
  const occurredAt = readString(value, "occurredAt");

  if (
    !fillId ||
    (action !== "buy" && action !== "sell") ||
    (side !== "yes" && side !== "no") ||
    priceCents === null ||
    quantity === null ||
    sourceStepIndex === null ||
    !occurredAt
  ) {
    return null;
  }

  return {
    fillId,
    action,
    side,
    priceCents,
    quantity,
    feeCents,
    sourceStepIndex,
    occurredAt,
  };
}

function collectFills(backtestResult: Record<string, unknown>): ParsedFill[] {
  const strategyRun = backtestResult.strategyRun;
  if (!isRecord(strategyRun) || !Array.isArray(strategyRun.steps)) {
    return [];
  }

  const fills: ParsedFill[] = [];
  for (const step of strategyRun.steps) {
    if (!isRecord(step) || !Array.isArray(step.acceptedFills)) {
      continue;
    }

    for (const fill of step.acceptedFills) {
      const parsed = parseFill(fill);
      if (parsed) {
        fills.push(parsed);
      }
    }
  }

  return fills.sort((left, right) => {
    const timeCompare = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    if (timeCompare !== 0) {
      return timeCompare;
    }
    return left.sourceStepIndex - right.sourceStepIndex;
  });
}

function buildClosedTradeAttributions(fills: readonly ParsedFill[]): ClosedTradeAttribution[] {
  type PositionState = {
    quantity: number;
    averageCostCents: number;
    entrySourceStepIndex: number;
    entryFillPriceCents: number;
  };

  const positions = new Map<string, PositionState>();
  const attributions: ClosedTradeAttribution[] = [];

  for (const fill of fills) {
    if (fill.action === "buy") {
      const positionKey = fill.side;
      const existing = positions.get(positionKey);
      if (existing) {
        const totalQuantity = existing.quantity + fill.quantity;
        const weightedCost =
          existing.averageCostCents * existing.quantity + fill.priceCents * fill.quantity;
        positions.set(positionKey, {
          quantity: totalQuantity,
          averageCostCents: weightedCost / totalQuantity,
          entrySourceStepIndex: existing.entrySourceStepIndex,
          entryFillPriceCents: existing.entryFillPriceCents,
        });
      } else {
        positions.set(positionKey, {
          quantity: fill.quantity,
          averageCostCents: fill.priceCents,
          entrySourceStepIndex: fill.sourceStepIndex,
          entryFillPriceCents: fill.priceCents,
        });
      }
      continue;
    }

    const positionKey = fill.side;
    const existing = positions.get(positionKey);
    if (!existing || existing.quantity < fill.quantity) {
      continue;
    }

    const pnlCents =
      (fill.priceCents - existing.averageCostCents) * fill.quantity - fill.feeCents;

    attributions.push({
      entrySourceStepIndex: existing.entrySourceStepIndex,
      pnlCents,
      fillPriceCents: existing.entryFillPriceCents,
      isWin: pnlCents > 0,
    });

    const remainingQuantity = existing.quantity - fill.quantity;
    if (remainingQuantity > 0) {
      positions.set(positionKey, { ...existing, quantity: remainingQuantity });
    } else {
      positions.delete(positionKey);
    }
  }

  return attributions;
}

function readBtcReturnPctFromMetadata(metadata: Record<string, unknown>): number | null {
  const candidates = ["momentumPct", "btcReturnPct", "returnPct"];
  for (const key of candidates) {
    const value = readFiniteNumber(metadata, key);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function readRegimeTag(metadata: Record<string, unknown>): string | null {
  const candidates = ["regimeTag", "regime", "regimeId"];
  for (const key of candidates) {
    const value = readString(metadata, key);
    if (value) {
      return value;
    }
  }
  return null;
}

function buildReplayStepContexts(
  backtestResult: Record<string, unknown>,
): Map<number, ReplayStepContext> {
  const contexts = new Map<number, ReplayStepContext>();
  const replayResult = parseJsonValue(backtestResult.replayResult, "replayResult");
  if (!isRecord(replayResult) || !Array.isArray(replayResult.results)) {
    return contexts;
  }

  let previousBtcPrice: number | null = null;

  replayResult.results.forEach((step, stepIndex) => {
    if (!isRecord(step) || !isRecord(step.engineInput)) {
      return;
    }

    const engineInput = step.engineInput;
    const market = isRecord(engineInput.market) ? engineInput.market : null;
    const btc = isRecord(engineInput.btc) ? engineInput.btc : null;
    const timeRemainingMs = market ? readFiniteNumber(market, "timeRemainingMs") : null;
    const btcPrice = btc ? readFiniteNumber(btc, "price") : null;

    let btcReturnPct: number | null = null;
    if (btcPrice !== null && previousBtcPrice !== null && previousBtcPrice > 0) {
      btcReturnPct = ((btcPrice - previousBtcPrice) / previousBtcPrice) * 100;
    }

    if (btcPrice !== null) {
      previousBtcPrice = btcPrice;
    }

    contexts.set(stepIndex, { timeRemainingMs, btcReturnPct });
  });

  return contexts;
}

function findTraceEntry(
  document: StrategyDecisionTraceDocument,
  candleIndex: number,
): StrategyDecisionTraceDocument["entries"][number] | null {
  return document.entries.find((entry) => entry.candleIndex === candleIndex) ?? null;
}

export function extractAttributionObservations(
  scanned: ScannedDecisionTrace,
  researchOutputJson: string,
): {
  observations: AttributionObservation[];
  warnings: AttributionWarning[];
} {
  const warnings: AttributionWarning[] = [];
  const document = parseTraceDocument(scanned.traceJson, scanned.tracePath);

  const researchOutput = parseJsonValue(researchOutputJson, scanned.researchOutputPath);
  if (!isRecord(researchOutput)) {
    warnings.push({
      code: "invalid-research-output",
      message: `Invalid research output at ${scanned.researchOutputPath}`,
      tracePath: scanned.tracePath,
      marketTicker: scanned.marketTicker,
    });
    return { observations: [], warnings };
  }

  const researchRun = parseJsonValue(researchOutput.researchRun, "researchRun");
  if (!isRecord(researchRun)) {
    warnings.push({
      code: "invalid-research-output",
      message: `Missing researchRun in ${scanned.researchOutputPath}`,
      tracePath: scanned.tracePath,
      marketTicker: scanned.marketTicker,
    });
    return { observations: [], warnings };
  }

  const backtestResult = parseJsonValue(researchRun.backtestResult, "backtestResult");
  if (!isRecord(backtestResult)) {
    warnings.push({
      code: "invalid-research-output",
      message: `Missing backtestResult in ${scanned.researchOutputPath}`,
      tracePath: scanned.tracePath,
      marketTicker: scanned.marketTicker,
    });
    return { observations: [], warnings };
  }

  const fills = collectFills(backtestResult);
  if (fills.length === 0) {
    warnings.push({
      code: "missing-fills",
      message: `No accepted fills found for ${scanned.marketTicker}`,
      tracePath: scanned.tracePath,
      marketTicker: scanned.marketTicker,
    });
    return { observations: [], warnings };
  }

  const replayContexts = buildReplayStepContexts(backtestResult);
  const closedTrades = buildClosedTradeAttributions(fills);
  const observations: AttributionObservation[] = [];

  for (const trade of closedTrades) {
    const traceEntry = findTraceEntry(document, trade.entrySourceStepIndex);
    if (!traceEntry) {
      continue;
    }

    const replayContext = replayContexts.get(trade.entrySourceStepIndex) ?? {
      timeRemainingMs: null,
      btcReturnPct: null,
    };

    const yesMidBucket = resolveNumericBucket(traceEntry.yesMid, YES_MID_BUCKET_DEFINITIONS);
    const timeBucket = resolveNumericBucket(
      replayContext.timeRemainingMs,
      TIME_REMAINING_BUCKET_DEFINITIONS,
    );

    const metadataBtcReturn = readBtcReturnPctFromMetadata(traceEntry.metadata);
    const btcReturnBucket = resolveNumericBucket(
      metadataBtcReturn ?? replayContext.btcReturnPct,
      BTC_RETURN_BUCKET_DEFINITIONS,
    );
    const regimeBucket = resolveCategoricalBucket(readRegimeTag(traceEntry.metadata));
    const actionBucket = resolveCategoricalBucket(traceEntry.action);

    observations.push({
      strategyId: document.strategyId,
      seriesTicker: scanned.seriesTicker,
      marketTicker: scanned.marketTicker,
      tracePath: scanned.tracePath,
      candleIndex: trade.entrySourceStepIndex,
      action: actionBucket.bucketId,
      yesMidBucketId: yesMidBucket.bucketId,
      yesMidBucketLabel: yesMidBucket.bucketLabel,
      timeRemainingBucketId: timeBucket.bucketId,
      timeRemainingBucketLabel: timeBucket.bucketLabel,
      btcReturnBucketId: btcReturnBucket.bucketId,
      btcReturnBucketLabel: btcReturnBucket.bucketLabel,
      regimeTagBucketId: regimeBucket.bucketId,
      regimeTagBucketLabel: regimeBucket.bucketLabel,
      pnlCents: trade.pnlCents,
      fillPriceCents: trade.fillPriceCents,
      isWin: trade.isWin,
    });
  }

  return { observations, warnings };
}
