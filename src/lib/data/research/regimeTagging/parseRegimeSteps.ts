import {
  maxSpreadSidePercent,
  midProbabilityFromCents,
} from "@/lib/features/contractPricing";
import {
  RegimeTaggingError,
  RegimeTaggingErrorCode,
  type RegimeStepPoint,
  type RegimeTaggingWarning,
} from "./regimeTaggingTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: unknown, label: string): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new RegimeTaggingError(
        `${label} contains invalid JSON`,
        RegimeTaggingErrorCode.INVALID_DOCUMENT,
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

function maxSpreadPercent(pricing: Record<string, unknown>): number | null {
  return maxSpreadSidePercent({
    yesBidCents: readFiniteNumber(pricing, "yesBidCents"),
    yesAskCents: readFiniteNumber(pricing, "yesAskCents"),
    noBidCents: readFiniteNumber(pricing, "noBidCents"),
    noAskCents: readFiniteNumber(pricing, "noAskCents"),
  });
}

function extractReplayStepPoints(backtestResult: Record<string, unknown>): RegimeStepPoint[] {
  const replayResult = parseJsonValue(backtestResult.replayResult, "replayResult");
  if (!isRecord(replayResult) || !Array.isArray(replayResult.results)) {
    return [];
  }

  const points: RegimeStepPoint[] = [];

  replayResult.results.forEach((step, stepIndex) => {
    if (!isRecord(step) || !isRecord(step.engineInput)) {
      return;
    }

    const engineInput = step.engineInput;
    const pricing = isRecord(engineInput.pricing) ? engineInput.pricing : null;
    const market = isRecord(engineInput.market) ? engineInput.market : null;
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
      || !pricing
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
      impliedProbability: midProbabilityFromCents(yesBidCents, yesAskCents),
      maxSpreadPercent: maxSpreadPercent(pricing),
      timeRemainingMs: market ? readFiniteNumber(market, "timeRemainingMs") ?? null : null,
    });
  });

  return points;
}

function extractSnapshotFallbackStepPoints(snapshot: Record<string, unknown>): RegimeStepPoint[] {
  const marketWindow = isRecord(snapshot.marketWindow) ? snapshot.marketWindow : null;
  const closeTimeMs = marketWindow?.closeTime
    ? Date.parse(String(marketWindow.closeTime))
    : Number.NaN;

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

    const noBidCents = readFiniteNumber(candle, "noBidCents") ?? yesBidCents;
    const noAskCents = readFiniteNumber(candle, "noAskCents") ?? yesAskCents;

    return [
      {
        stepIndex,
        timestampMs,
        btcPrice,
        impliedProbability: midProbabilityFromCents(yesBidCents, yesAskCents),
        maxSpreadPercent: maxSpreadPercent({
          yesBidCents,
          yesAskCents,
          noBidCents,
          noAskCents,
        }),
        timeRemainingMs:
          Number.isFinite(closeTimeMs) && closeTime
            ? Math.max(closeTimeMs - Date.parse(closeTime), 0)
            : null,
      },
    ];
  });
}

export type ExtractedRegimeMarketData = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  steps: readonly RegimeStepPoint[];
  warnings: readonly RegimeTaggingWarning[];
};

/** Parses runner-format research output into per-step regime observations. */
export function extractRegimeStepsFromResearchOutput(
  json: string,
  outputPath: string,
  pathContext?: {
    strategyId?: string;
    seriesTicker?: string;
    marketTicker?: string;
  },
): ExtractedRegimeMarketData {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new RegimeTaggingError(
      "research-output.json contains invalid JSON",
      RegimeTaggingErrorCode.INVALID_JSON,
    );
  }

  if (!isRecord(parsed) || !("dataset" in parsed) || !("researchRun" in parsed)) {
    throw new RegimeTaggingError(
      "research-output.json must use runner format with dataset and researchRun",
      RegimeTaggingErrorCode.INVALID_DOCUMENT,
    );
  }

  const metadata = parsed.metadata;
  const researchRun = parseJsonValue(parsed.researchRun, "researchRun");
  const dataset = parseJsonValue(parsed.dataset, "dataset");

  if (!isRecord(researchRun) || !isRecord(dataset) || !Array.isArray(dataset.snapshots)) {
    throw new RegimeTaggingError(
      "research output is missing dataset snapshots or researchRun",
      RegimeTaggingErrorCode.INVALID_DOCUMENT,
    );
  }

  const snapshot = dataset.snapshots.find((entry) => isRecord(entry));
  if (!snapshot || !isRecord(snapshot)) {
    throw new RegimeTaggingError(
      "dataset.snapshots must contain at least one snapshot",
      RegimeTaggingErrorCode.INVALID_DOCUMENT,
    );
  }

  const marketWindow = isRecord(snapshot.marketWindow) ? snapshot.marketWindow : null;
  const marketTicker =
    readString(snapshot, "ticker")
    ?? pathContext?.marketTicker?.trim()
    ?? (marketWindow ? readString(marketWindow, "ticker") : undefined)
    ?? "";

  if (!marketTicker) {
    throw new RegimeTaggingError(
      "Unable to resolve marketTicker from research output",
      RegimeTaggingErrorCode.INVALID_DOCUMENT,
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

  const warnings: RegimeTaggingWarning[] = [];
  const backtestResult = parseJsonValue(researchRun.backtestResult, "backtestResult");
  const replaySteps = isRecord(backtestResult)
    ? extractReplayStepPoints(backtestResult)
    : [];

  const steps =
    replaySteps.length > 0
      ? replaySteps
      : extractSnapshotFallbackStepPoints(snapshot);

  if (steps.length === 0) {
    warnings.push({
      code: "missing-steps",
      message: `Missing replay steps for market ${marketTicker}`,
      marketTicker,
    });
  }

  return {
    strategyId,
    seriesTicker,
    marketTicker,
    steps: steps.sort((left, right) => left.stepIndex - right.stepIndex),
    warnings,
  };
}
