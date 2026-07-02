import {
  LeadLagError,
  LeadLagErrorCode,
  type LeadLagCandlePoint,
  type LeadLagWarning,
} from "./leadLagTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: unknown, label: string): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new LeadLagError(
        `${label} contains invalid JSON`,
        LeadLagErrorCode.INVALID_DOCUMENT,
      );
    }
  }

  return value;
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function midProbability(yesBidCents: number, yesAskCents: number): number {
  return (yesBidCents + yesAskCents) / 2 / 100;
}

function extractReplayCandlePoints(input: {
  backtestResult: Record<string, unknown>;
}): LeadLagCandlePoint[] {
  const replayResult = parseJsonValue(input.backtestResult.replayResult, "replayResult");
  if (!isRecord(replayResult) || !Array.isArray(replayResult.results)) {
    return [];
  }

  const points: LeadLagCandlePoint[] = [];

  replayResult.results.forEach((step, stepIndex) => {
    if (!isRecord(step) || !isRecord(step.engineInput)) {
      return;
    }

    const engineInput = step.engineInput;
    const pricing = isRecord(engineInput.pricing) ? engineInput.pricing : null;
    const btc = isRecord(engineInput.btc) ? engineInput.btc : null;

    const yesBidCents = pricing ? readFiniteNumber(pricing, "yesBidCents") : undefined;
    const yesAskCents = pricing ? readFiniteNumber(pricing, "yesAskCents") : undefined;
    const btcPrice = btc ? readFiniteNumber(btc, "price") : undefined;
    const evaluatedAt = readString(engineInput, "evaluatedAt");

    if (
      yesBidCents === undefined
      || yesAskCents === undefined
      || btcPrice === undefined
      || btcPrice <= 0
    ) {
      return;
    }

    const timestampMs = evaluatedAt ? Date.parse(evaluatedAt) : Number.NaN;
    if (!Number.isFinite(timestampMs)) {
      return;
    }

    points.push({
      stepIndex,
      timestampMs,
      btcPrice,
      impliedProbability: midProbability(yesBidCents, yesAskCents),
    });
  });

  return points;
}

function extractSnapshotFallbackCandlePoints(
  snapshot: Record<string, unknown>,
): LeadLagCandlePoint[] {
  const btcBars = Array.isArray(snapshot.btcBars) ? snapshot.btcBars : [];
  const latestBtcClose = btcBars
    .map((bar) => (isRecord(bar) ? readFiniteNumber(bar, "closeUsd") : undefined))
    .filter((value): value is number => value !== undefined && value > 0)
    .at(-1);

  const kalshiCandles = Array.isArray(snapshot.kalshiCandles)
    ? snapshot.kalshiCandles
    : [];

  return kalshiCandles.flatMap((candle, stepIndex) => {
    if (!isRecord(candle)) {
      return [];
    }

    const yesBidCents = readFiniteNumber(candle, "yesBidCents");
    const yesAskCents = readFiniteNumber(candle, "yesAskCents");
    if (yesBidCents === undefined || yesAskCents === undefined) {
      return [];
    }

    const closeTime = readString(candle, "closeTime") ?? readString(candle, "openTime");
    const timestampMs = closeTime ? Date.parse(closeTime) : Number.NaN;
    if (!Number.isFinite(timestampMs)) {
      return [];
    }

    const btcPrice = latestBtcClose;
    if (btcPrice === undefined) {
      return [];
    }

    return [
      {
        stepIndex,
        timestampMs,
        btcPrice,
        impliedProbability: midProbability(yesBidCents, yesAskCents),
      },
    ];
  });
}

export type ExtractedLeadLagMarketData = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  candles: readonly LeadLagCandlePoint[];
  skippedMissingCandles: number;
  warnings: readonly LeadLagWarning[];
};

/** Parses runner-format research output into aligned BTC / implied-probability candles. */
export function extractLeadLagCandlesFromResearchOutput(
  json: string,
  outputPath: string,
  pathContext?: {
    strategyId?: string;
    seriesTicker?: string;
    marketTicker?: string;
  },
): ExtractedLeadLagMarketData {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new LeadLagError(
      "research-output.json contains invalid JSON",
      LeadLagErrorCode.INVALID_JSON,
    );
  }

  if (!isRecord(parsed) || !("dataset" in parsed) || !("researchRun" in parsed)) {
    throw new LeadLagError(
      "research-output.json must use runner format with dataset and researchRun",
      LeadLagErrorCode.INVALID_DOCUMENT,
    );
  }

  const metadata = parsed.metadata;
  const researchRun = parseJsonValue(parsed.researchRun, "researchRun");
  const dataset = parseJsonValue(parsed.dataset, "dataset");

  if (!isRecord(researchRun) || !isRecord(dataset) || !Array.isArray(dataset.snapshots)) {
    throw new LeadLagError(
      "research output is missing dataset snapshots or researchRun",
      LeadLagErrorCode.INVALID_DOCUMENT,
    );
  }

  const snapshot = dataset.snapshots.find((entry) => isRecord(entry));
  if (!snapshot || !isRecord(snapshot)) {
    throw new LeadLagError(
      "dataset.snapshots must contain at least one snapshot",
      LeadLagErrorCode.INVALID_DOCUMENT,
    );
  }

  const marketWindow = isRecord(snapshot.marketWindow) ? snapshot.marketWindow : null;
  const marketTicker =
    readString(snapshot, "ticker")
    ?? pathContext?.marketTicker?.trim()
    ?? (marketWindow ? readString(marketWindow, "ticker") : undefined)
    ?? "";

  if (!marketTicker) {
    throw new LeadLagError(
      "Unable to resolve marketTicker from research output",
      LeadLagErrorCode.INVALID_DOCUMENT,
    );
  }

  const seriesTicker =
    pathContext?.seriesTicker?.trim()
    ?? (marketWindow ? readString(marketWindow, "seriesTicker") : undefined)
    ?? marketTicker.split("-")[0]
    ?? marketTicker;

  const strategyId =
    pathContext?.strategyId?.trim()
    ?? (isRecord(metadata) ? readString(metadata, "strategyId") : undefined)
    ?? (isRecord(researchRun.config) ? readString(researchRun.config, "strategyId") : undefined)
    ?? "unknown";

  const backtestResult = parseJsonValue(researchRun.backtestResult, "backtestResult");
  const replayCandles = isRecord(backtestResult)
    ? extractReplayCandlePoints({ backtestResult })
    : [];
  const fallbackCandles =
    replayCandles.length > 0 ? [] : extractSnapshotFallbackCandlePoints(snapshot);

  const candles = [...(replayCandles.length > 0 ? replayCandles : fallbackCandles)].sort(
    (left, right) => left.stepIndex - right.stepIndex,
  );

  const warnings: LeadLagWarning[] = [];
  const replayResult = isRecord(backtestResult)
    ? parseJsonValue(backtestResult.replayResult, "replayResult")
    : null;
  const expectedCandleCount = isRecord(replayResult) && Array.isArray(replayResult.results)
    ? replayResult.results.length
    : Array.isArray(snapshot.kalshiCandles)
      ? snapshot.kalshiCandles.length
      : candles.length;

  const skippedMissingCandles = Math.max(expectedCandleCount - candles.length, 0);

  if (candles.length === 0) {
    warnings.push({
      code: "missing-candles",
      message: `Missing BTC price or implied probability candles for market ${marketTicker}`,
      marketTicker,
    });
  } else if (skippedMissingCandles > 0) {
    warnings.push({
      code: "partial-candles",
      message: `Skipped ${skippedMissingCandles} candles with missing BTC or implied probability for market ${marketTicker}`,
      marketTicker,
    });
  }

  return {
    strategyId,
    seriesTicker,
    marketTicker,
    candles,
    skippedMissingCandles,
    warnings,
  };
}
