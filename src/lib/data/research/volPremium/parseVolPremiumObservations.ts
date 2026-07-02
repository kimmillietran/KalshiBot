import { percentToTarget } from "@/lib/features/targetDistance";
import type { RegimeMarketTags } from "@/lib/data/research/regimeTagging/regimeTaggingTypes";
import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

import {
  computeVolPremium,
  estimateBackwardRealizedVolatility,
  estimateForwardRealizedVolatility,
  estimateImpliedVolatility,
} from "./volPremiumMath";
import {
  DEFAULT_VOL_PREMIUM_VOLATILITY_LOOKBACK_BARS,
  ImpliedVolatilityInversionCode,
  VolPremiumError,
  VolPremiumErrorCode,
  type VolPremiumObservation,
  type VolPremiumWarning,
} from "./volPremiumTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: unknown, label: string): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new VolPremiumError(
        `${label} contains invalid JSON`,
        VolPremiumErrorCode.INVALID_DOCUMENT,
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

function mapCandles(value: unknown): EvaluationCandleSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const candles: EvaluationCandleSnapshot[] = [];

  for (const candle of value) {
    if (!isRecord(candle)) {
      continue;
    }

    const timestamp = readFiniteNumber(candle, "timestamp");
    const open = readFiniteNumber(candle, "open");
    const high = readFiniteNumber(candle, "high");
    const low = readFiniteNumber(candle, "low");
    const close = readFiniteNumber(candle, "close");

    if (
      timestamp === undefined
      || open === undefined
      || high === undefined
      || low === undefined
      || close === undefined
    ) {
      continue;
    }

    candles.push({ timestamp, open, high, low, close });
  }

  return candles;
}

function mapSnapshotBtcBars(snapshot: Record<string, unknown>): EvaluationCandleSnapshot[] {
  const btcBars = Array.isArray(snapshot.btcBars) ? snapshot.btcBars : [];

  return btcBars
    .map((bar, index) => {
      if (!isRecord(bar)) {
        return null;
      }

      const close = readFiniteNumber(bar, "closeUsd");
      if (close === undefined) {
        return null;
      }

      const eventTime = readString(bar, "closeTime") ?? readString(bar, "openTime");
      const timestamp = eventTime ? Date.parse(eventTime) : index * 60_000;

      return {
        timestamp,
        open: readFiniteNumber(bar, "openUsd") ?? close,
        high: readFiniteNumber(bar, "highUsd") ?? close,
        low: readFiniteNumber(bar, "lowUsd") ?? close,
        close,
      };
    })
    .filter((candle): candle is EvaluationCandleSnapshot => candle !== null);
}

function buildVolPremiumObservation(input: {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  stepIndex: number;
  impliedProbability: number;
  spotPrice: number | null;
  strikePrice: number | null;
  timeRemainingMs: number | null;
  evalCandles: readonly EvaluationCandleSnapshot[];
  fullCandles: readonly EvaluationCandleSnapshot[];
  closeTimestampMs: number | null;
  evalTimestampMs: number | null;
  regimeTags: RegimeMarketTags | null;
  volatilityLookbackBars: number;
}): VolPremiumObservation {
  const moneynessPercent =
    input.spotPrice !== null && input.strikePrice !== null
      ? percentToTarget(input.spotPrice, input.strikePrice).percent
      : null;

  const impliedResult =
    input.spotPrice !== null
    && input.strikePrice !== null
    && input.timeRemainingMs !== null
      ? estimateImpliedVolatility({
          impliedProbability: input.impliedProbability,
          spotPrice: input.spotPrice,
          strikePrice: input.strikePrice,
          timeRemainingMs: input.timeRemainingMs,
        })
      : { ok: false as const, code: ImpliedVolatilityInversionCode.MISSING_INPUT };

  const backwardVol = input.evalCandles.length > 0
    ? estimateBackwardRealizedVolatility(
        input.evalCandles,
        input.volatilityLookbackBars,
      )?.annualizedVol ?? null
    : null;

  const forwardVol =
    input.evalTimestampMs !== null
    && input.closeTimestampMs !== null
    && input.fullCandles.length > 0
      ? estimateForwardRealizedVolatility(
          input.fullCandles,
          input.evalTimestampMs,
          input.closeTimestampMs,
          input.volatilityLookbackBars,
        )?.annualizedVol ?? null
      : null;

  const impliedVolatilityAnnualized = impliedResult.ok ? impliedResult.annualizedVol : null;
  const inversionCode = impliedResult.ok
    ? ImpliedVolatilityInversionCode.OK
    : impliedResult.code;

  return {
    strategyId: input.strategyId,
    seriesTicker: input.seriesTicker,
    marketTicker: input.marketTicker,
    outputPath: input.outputPath,
    stepIndex: input.stepIndex,
    impliedProbability: input.impliedProbability,
    spotPrice: input.spotPrice,
    strikePrice: input.strikePrice,
    timeRemainingMs: input.timeRemainingMs,
    moneynessPercent,
    impliedVolatilityAnnualized,
    inversionCode,
    realizedVolatilityBackwardAnnualized: backwardVol,
    realizedVolatilityForwardAnnualized: forwardVol,
    volPremium: computeVolPremium(impliedVolatilityAnnualized, forwardVol),
    regimeTags: input.regimeTags,
  };
}

function extractReplayStepObservations(input: {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  backtestResult: Record<string, unknown>;
  fullCandles: readonly EvaluationCandleSnapshot[];
  closeTimestampMs: number | null;
  regimeTags: RegimeMarketTags | null;
  volatilityLookbackBars: number;
}): VolPremiumObservation[] {
  const replayResult = parseJsonValue(input.backtestResult.replayResult, "replayResult");
  if (!isRecord(replayResult) || !Array.isArray(replayResult.results)) {
    return [];
  }

  const observations: VolPremiumObservation[] = [];

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

    if (yesBidCents === undefined || yesAskCents === undefined) {
      return;
    }

    const spotPrice = btc ? readFiniteNumber(btc, "price") ?? null : null;
    const strikePrice = market ? readFiniteNumber(market, "strikePrice") ?? null : null;
    const timeRemainingMs = market
      ? readFiniteNumber(market, "timeRemainingMs") ?? null
      : null;
    const evalCandles = btc ? mapCandles(btc.candles) : [];
    const evalTimestampMs =
      readFiniteNumber(engineInput, "evaluatedAt")
      ?? evalCandles[evalCandles.length - 1]?.timestamp
      ?? null;

    observations.push(
      buildVolPremiumObservation({
        strategyId: input.strategyId,
        seriesTicker: input.seriesTicker,
        marketTicker: input.marketTicker,
        outputPath: input.outputPath,
        stepIndex,
        impliedProbability: midProbability(yesBidCents, yesAskCents),
        spotPrice,
        strikePrice,
        timeRemainingMs,
        evalCandles,
        fullCandles: input.fullCandles.length > 0 ? input.fullCandles : evalCandles,
        closeTimestampMs: input.closeTimestampMs,
        evalTimestampMs,
        regimeTags: input.regimeTags,
        volatilityLookbackBars: input.volatilityLookbackBars,
      }),
    );
  });

  return observations;
}

function extractSnapshotFallbackObservations(input: {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  snapshot: Record<string, unknown>;
  regimeTags: RegimeMarketTags | null;
  volatilityLookbackBars: number;
}): VolPremiumObservation[] {
  const marketWindow = isRecord(input.snapshot.marketWindow)
    ? input.snapshot.marketWindow
    : null;
  const strikePrice = marketWindow
    ? readFiniteNumber(marketWindow, "strikePriceUsd") ?? null
    : null;
  const closeTimeMs = marketWindow?.closeTime
    ? Date.parse(String(marketWindow.closeTime))
    : Number.NaN;
  const fullCandles = mapSnapshotBtcBars(input.snapshot);

  const kalshiCandles = Array.isArray(input.snapshot.kalshiCandles)
    ? input.snapshot.kalshiCandles
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

    const candleCloseTime = readString(candle, "closeTime");
    const evalTimestampMs = candleCloseTime ? Date.parse(candleCloseTime) : null;
    const timeRemainingMs =
      Number.isFinite(closeTimeMs) && evalTimestampMs !== null
        ? Math.max(closeTimeMs - evalTimestampMs, 0)
        : null;
    const evalCandles = fullCandles.filter(
      (bar) => evalTimestampMs === null || bar.timestamp <= evalTimestampMs,
    );
    const spotPrice =
      evalCandles.length > 0 ? evalCandles[evalCandles.length - 1]?.close ?? null : null;

    return [
      buildVolPremiumObservation({
        strategyId: input.strategyId,
        seriesTicker: input.seriesTicker,
        marketTicker: input.marketTicker,
        outputPath: input.outputPath,
        stepIndex,
        impliedProbability: midProbability(yesBidCents, yesAskCents),
        spotPrice,
        strikePrice,
        timeRemainingMs,
        evalCandles,
        fullCandles,
        closeTimestampMs: Number.isFinite(closeTimeMs) ? closeTimeMs : null,
        evalTimestampMs,
        regimeTags: input.regimeTags,
        volatilityLookbackBars: input.volatilityLookbackBars,
      }),
    ];
  });
}

export type ExtractedVolPremiumMarketData = {
  observations: readonly VolPremiumObservation[];
  warnings: readonly VolPremiumWarning[];
};

export function buildVolPremiumJoinKey(strategyId: string, marketTicker: string): string {
  return `${strategyId}/${marketTicker}`;
}

/** Parses runner-format research output into vol premium observations. */
export function extractVolPremiumObservationsFromResearchOutput(
  json: string,
  outputPath: string,
  options?: {
    strategyId?: string;
    seriesTicker?: string;
    marketTicker?: string;
    regimeTags?: RegimeMarketTags | null;
    volatilityLookbackBars?: number;
  },
): ExtractedVolPremiumMarketData {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new VolPremiumError(
      "research-output.json contains invalid JSON",
      VolPremiumErrorCode.INVALID_JSON,
    );
  }

  if (!isRecord(parsed) || !("dataset" in parsed) || !("researchRun" in parsed)) {
    throw new VolPremiumError(
      "research-output.json must use runner format with dataset and researchRun",
      VolPremiumErrorCode.INVALID_DOCUMENT,
    );
  }

  const metadata = parsed.metadata;
  const researchRun = parseJsonValue(parsed.researchRun, "researchRun");
  const dataset = parseJsonValue(parsed.dataset, "dataset");

  if (!isRecord(researchRun) || !isRecord(dataset) || !Array.isArray(dataset.snapshots)) {
    throw new VolPremiumError(
      "research output is missing dataset snapshots or researchRun",
      VolPremiumErrorCode.INVALID_DOCUMENT,
    );
  }

  const snapshot = dataset.snapshots.find((entry) => isRecord(entry));
  if (!snapshot || !isRecord(snapshot)) {
    throw new VolPremiumError(
      "dataset.snapshots must contain at least one snapshot",
      VolPremiumErrorCode.INVALID_DOCUMENT,
    );
  }

  const marketWindow = isRecord(snapshot.marketWindow) ? snapshot.marketWindow : null;
  const marketTicker =
    readString(snapshot, "ticker")
    ?? options?.marketTicker?.trim()
    ?? (marketWindow ? readString(marketWindow, "ticker") : undefined)
    ?? "";

  if (!marketTicker) {
    throw new VolPremiumError(
      "Unable to resolve marketTicker from research output",
      VolPremiumErrorCode.INVALID_DOCUMENT,
    );
  }

  const seriesTicker =
    options?.seriesTicker?.trim()
    ?? (marketWindow ? readString(marketWindow, "seriesTicker") : undefined)
    ?? marketTicker.split("-")[0]
    ?? marketTicker;

  const strategyId =
    options?.strategyId?.trim()
    ?? (isRecord(metadata) ? readString(metadata, "strategyId") : undefined)
    ?? (isRecord(researchRun.config) ? readString(researchRun.config, "strategyId") : undefined)
    ?? "unknown";

  const volatilityLookbackBars =
    options?.volatilityLookbackBars ?? DEFAULT_VOL_PREMIUM_VOLATILITY_LOOKBACK_BARS;
  const fullCandles = mapSnapshotBtcBars(snapshot);
  const closeTimestampMs = marketWindow?.closeTime
    ? Date.parse(String(marketWindow.closeTime))
    : Number.NaN;
  const regimeTags = options?.regimeTags ?? null;

  const settlement = snapshot.settlement;
  const warnings: VolPremiumWarning[] = [];

  if (
    !isRecord(settlement)
    || (settlement.result !== "yes" && settlement.result !== "no")
  ) {
    warnings.push({
      code: "missing-settlement",
      message: `Missing settlement for market ${marketTicker}`,
      marketTicker,
    });

    return { observations: [], warnings };
  }

  const backtestResult = parseJsonValue(researchRun.backtestResult, "backtestResult");
  const replayObservations = isRecord(backtestResult)
    ? extractReplayStepObservations({
        strategyId,
        seriesTicker,
        marketTicker,
        outputPath,
        backtestResult,
        fullCandles,
        closeTimestampMs: Number.isFinite(closeTimestampMs) ? closeTimestampMs : null,
        regimeTags,
        volatilityLookbackBars,
      })
    : [];

  const observations =
    replayObservations.length > 0
      ? replayObservations
      : extractSnapshotFallbackObservations({
          strategyId,
          seriesTicker,
          marketTicker,
          outputPath,
          snapshot,
          regimeTags,
          volatilityLookbackBars,
        });

  if (observations.length === 0) {
    warnings.push({
      code: "missing-probability",
      message: `Missing Kalshi implied probability for market ${marketTicker}`,
      marketTicker,
    });
  }

  if (
    observations.some(
      (observation) =>
        observation.timeRemainingMs === null
        || observation.moneynessPercent === null,
    )
  ) {
    warnings.push({
      code: "missing-context",
      message: `Missing time or moneyness context for market ${marketTicker}`,
      marketTicker,
    });
  }

  return {
    observations: observations.sort((left, right) => {
      const marketCompare = left.marketTicker.localeCompare(right.marketTicker);
      if (marketCompare !== 0) {
        return marketCompare;
      }

      return left.stepIndex - right.stepIndex;
    }),
    warnings,
  };
}
