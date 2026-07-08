import { mapEvaluationCandleSnapshots } from "@/lib/data/research/parsing/mapEvaluationCandleSnapshots";
import { estimateRealizedVolatility } from "@/lib/data/strategies/fairValueDiffusion/fairValueDiffusionModel";
import { midProbabilityFromCents } from "@/lib/features/contractPricing";
import { percentToTarget } from "@/lib/features/targetDistance";
import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

import {
  findFirstDatasetSnapshot,
  findLastDatasetSnapshot,
  findSettlementInDatasetSnapshots,
  formatMissingSettlementDiagnostic,
} from "@/lib/data/research/settlement";
import {
  readSettlementQualityFlagsFromRecord,
  settlementHasDerivedExpirationValue,
} from "@/lib/data/research/settlement/readResearchOutputSettlement";

import { computeResearchObservationMomentumPercent } from "@/lib/data/research/dimensions/momentum/computeResearchObservationMomentumPercent";

import {
  DEFAULT_MISPRICING_VOLATILITY_LOOKBACK_BARS,
  type MispricingAtlasWarning,
} from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import {
  computeYesSpreadPercent,
  resolveQuoteStatus,
} from "./costAwareAtlasMath";
import {
  CostAwareAtlasError,
  CostAwareAtlasErrorCode,
  DERIVED_SETTLEMENT_QUALITY_FLAG,
  type CostAwareMispricingObservation,
  type SettlementSourceStatus,
} from "./costAwareAtlasTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: unknown, label: string): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new CostAwareAtlasError(
        `${label} contains invalid JSON`,
        CostAwareAtlasErrorCode.INVALID_DOCUMENT,
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

function readAnnualizedVolatility(
  candles: readonly EvaluationCandleSnapshot[],
): number | null {
  const estimate = estimateRealizedVolatility(
    candles,
    DEFAULT_MISPRICING_VOLATILITY_LOOKBACK_BARS,
  );

  return estimate?.annualizedVol ?? null;
}

function toTradingDayUtc(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function resolveSettlementSource(
  settlement: unknown,
): SettlementSourceStatus {
  if (settlementHasDerivedExpirationValue(settlement, DERIVED_SETTLEMENT_QUALITY_FLAG)) {
    return "derived";
  }

  const flags = readSettlementQualityFlagsFromRecord(settlement);
  if (flags.length > 0) {
    return "official";
  }

  return settlement == null ? "unknown" : "official";
}

function buildQuoteFields(
  yesBidCents: number | null,
  yesAskCents: number | null,
): Pick<
  CostAwareMispricingObservation,
  "yesBidCents" | "yesAskCents" | "spreadPercent" | "quoteStatus"
> {
  const quoteStatus = resolveQuoteStatus(yesBidCents, yesAskCents);

  if (quoteStatus !== "valid" || yesBidCents == null || yesAskCents == null) {
    return {
      yesBidCents,
      yesAskCents,
      spreadPercent: null,
      quoteStatus,
    };
  }

  return {
    yesBidCents,
    yesAskCents,
    spreadPercent: computeYesSpreadPercent(yesBidCents, yesAskCents),
    quoteStatus,
  };
}

function buildObservation(input: {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  stepIndex: number;
  yesBidCents: number | null;
  yesAskCents: number | null;
  observedOutcome: 0 | 1;
  spotPrice: number | null;
  strikePrice: number | null;
  timeRemainingMs: number | null;
  candles: readonly EvaluationCandleSnapshot[];
  observationTimestampMs?: number | null;
  settlementSource: SettlementSourceStatus;
}): CostAwareMispricingObservation {
  const quote = buildQuoteFields(input.yesBidCents, input.yesAskCents);
  const moneynessPercent =
    input.spotPrice !== null && input.strikePrice !== null
      ? percentToTarget(input.spotPrice, input.strikePrice).percent
      : null;

  return {
    strategyId: input.strategyId,
    seriesTicker: input.seriesTicker,
    marketTicker: input.marketTicker,
    outputPath: input.outputPath,
    stepIndex: input.stepIndex,
    predictedProbability:
      quote.quoteStatus === "valid"
      && input.yesBidCents != null
      && input.yesAskCents != null
        ? midProbabilityFromCents(input.yesBidCents, input.yesAskCents)
        : null,
    observedOutcome: input.observedOutcome,
    timeRemainingMs: input.timeRemainingMs,
    moneynessPercent,
    annualizedVolatility:
      input.candles.length > 0 ? readAnnualizedVolatility(input.candles) : null,
    momentumPercent:
      input.candles.length > 0
        ? computeResearchObservationMomentumPercent(input.candles)
        : null,
    tradingDayUtc:
      input.observationTimestampMs !== undefined
      && input.observationTimestampMs !== null
      && Number.isFinite(input.observationTimestampMs)
        ? toTradingDayUtc(input.observationTimestampMs)
        : null,
    timestampMs:
      input.observationTimestampMs !== undefined
      && input.observationTimestampMs !== null
      && Number.isFinite(input.observationTimestampMs)
        ? input.observationTimestampMs
        : null,
    settlementSource: input.settlementSource,
    ...quote,
  };
}

function extractReplayStepObservations(input: {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  observedOutcome: 0 | 1;
  backtestResult: Record<string, unknown>;
  settlementSource: SettlementSourceStatus;
}): CostAwareMispricingObservation[] {
  const replayResult = parseJsonValue(input.backtestResult.replayResult, "replayResult");
  if (!isRecord(replayResult) || !Array.isArray(replayResult.results)) {
    return [];
  }

  const observations: CostAwareMispricingObservation[] = [];

  replayResult.results.forEach((step, stepIndex) => {
    if (!isRecord(step) || !isRecord(step.engineInput)) {
      return;
    }

    const engineInput = step.engineInput;
    const pricing = isRecord(engineInput.pricing) ? engineInput.pricing : null;
    const market = isRecord(engineInput.market) ? engineInput.market : null;
    const btc = isRecord(engineInput.btc) ? engineInput.btc : null;

    const yesBidCents = pricing ? readFiniteNumber(pricing, "yesBidCents") ?? null : null;
    const yesAskCents = pricing ? readFiniteNumber(pricing, "yesAskCents") ?? null : null;

    const spotPrice = btc ? readFiniteNumber(btc, "price") ?? null : null;
    const strikePrice = market ? readFiniteNumber(market, "strikePrice") ?? null : null;
    const timeRemainingMs = market
      ? readFiniteNumber(market, "timeRemainingMs") ?? null
      : null;
    const candles = btc ? mapEvaluationCandleSnapshots(btc.candles) : [];
    const evaluatedAt = readString(engineInput, "evaluatedAt");
    const observationTimestampMs = evaluatedAt ? Date.parse(evaluatedAt) : Number.NaN;

    observations.push(
      buildObservation({
        strategyId: input.strategyId,
        seriesTicker: input.seriesTicker,
        marketTicker: input.marketTicker,
        outputPath: input.outputPath,
        stepIndex,
        yesBidCents,
        yesAskCents,
        observedOutcome: input.observedOutcome,
        spotPrice,
        strikePrice,
        timeRemainingMs,
        candles,
        observationTimestampMs: Number.isFinite(observationTimestampMs)
          ? observationTimestampMs
          : null,
        settlementSource: input.settlementSource,
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
  observedOutcome: 0 | 1;
  snapshot: Record<string, unknown>;
  settlementSource: SettlementSourceStatus;
}): CostAwareMispricingObservation[] {
  const marketWindow = isRecord(input.snapshot.marketWindow)
    ? input.snapshot.marketWindow
    : null;
  const strikePrice = marketWindow
    ? readFiniteNumber(marketWindow, "strikePriceUsd") ?? null
    : null;
  const closeTimeMs = marketWindow?.closeTime
    ? Date.parse(String(marketWindow.closeTime))
    : Number.NaN;

  const btcBars = Array.isArray(input.snapshot.btcBars) ? input.snapshot.btcBars : [];
  const candles: EvaluationCandleSnapshot[] = btcBars
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

  const spotPrice =
    candles.length > 0 ? candles[candles.length - 1]?.close ?? null : null;

  const kalshiCandles = Array.isArray(input.snapshot.kalshiCandles)
    ? input.snapshot.kalshiCandles
    : [];

  return kalshiCandles.flatMap((candle, stepIndex) => {
    if (!isRecord(candle)) {
      return [];
    }

    const yesBidCents = readFiniteNumber(candle, "yesBidCents") ?? null;
    const yesAskCents = readFiniteNumber(candle, "yesAskCents") ?? null;

    const candleCloseTime = readString(candle, "closeTime");
    const timeRemainingMs =
      Number.isFinite(closeTimeMs) && candleCloseTime
        ? Math.max(closeTimeMs - Date.parse(candleCloseTime), 0)
        : null;
    const observationTimestampMs = candleCloseTime
      ? Date.parse(candleCloseTime)
      : Number.NaN;

    return [
      buildObservation({
        strategyId: input.strategyId,
        seriesTicker: input.seriesTicker,
        marketTicker: input.marketTicker,
        outputPath: input.outputPath,
        stepIndex,
        yesBidCents,
        yesAskCents,
        observedOutcome: input.observedOutcome,
        spotPrice,
        strikePrice,
        timeRemainingMs,
        candles: candles.slice(0, stepIndex + 1),
        observationTimestampMs: Number.isFinite(observationTimestampMs)
          ? observationTimestampMs
          : null,
        settlementSource: input.settlementSource,
      }),
    ];
  });
}

export type ExtractedCostAwareMarketData = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  observations: readonly CostAwareMispricingObservation[];
  warnings: readonly MispricingAtlasWarning[];
};

/** Parses runner-format research output into cost-aware atlas observations. */
export function extractCostAwareObservationsFromResearchOutput(
  json: string,
  outputPath: string,
  pathContext?: {
    strategyId?: string;
    seriesTicker?: string;
    marketTicker?: string;
  },
): ExtractedCostAwareMarketData {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new CostAwareAtlasError(
      "research-output.json contains invalid JSON",
      CostAwareAtlasErrorCode.INVALID_JSON,
    );
  }

  if (!isRecord(parsed) || !("dataset" in parsed) || !("researchRun" in parsed)) {
    throw new CostAwareAtlasError(
      "research-output.json must use runner format with dataset and researchRun",
      CostAwareAtlasErrorCode.INVALID_DOCUMENT,
    );
  }

  const metadata = parsed.metadata;
  const researchRun = parseJsonValue(parsed.researchRun, "researchRun");
  const dataset = parseJsonValue(parsed.dataset, "dataset");

  if (!isRecord(researchRun) || !isRecord(dataset) || !Array.isArray(dataset.snapshots)) {
    throw new CostAwareAtlasError(
      "research output is missing dataset snapshots or researchRun",
      CostAwareAtlasErrorCode.INVALID_DOCUMENT,
    );
  }

  const contextSnapshot = findFirstDatasetSnapshot(dataset.snapshots);
  if (!contextSnapshot) {
    throw new CostAwareAtlasError(
      "dataset.snapshots must contain at least one snapshot",
      CostAwareAtlasErrorCode.INVALID_DOCUMENT,
    );
  }

  const fallbackSnapshot =
    findLastDatasetSnapshot(dataset.snapshots) ?? contextSnapshot;

  const marketWindow = isRecord(contextSnapshot.marketWindow)
    ? contextSnapshot.marketWindow
    : null;
  const marketTicker =
    readString(contextSnapshot, "ticker")
    ?? pathContext?.marketTicker?.trim()
    ?? (marketWindow ? readString(marketWindow, "ticker") : undefined)
    ?? "";

  if (!marketTicker) {
    throw new CostAwareAtlasError(
      "Unable to resolve marketTicker from research output",
      CostAwareAtlasErrorCode.INVALID_DOCUMENT,
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

  const settlementResolution = findSettlementInDatasetSnapshots(dataset.snapshots);
  const settlementOutcome = settlementResolution.outcome;
  const settlementSnapshot =
    settlementResolution.snapshotIndex == null
      ? null
      : dataset.snapshots[settlementResolution.snapshotIndex];
  const settlementSource = resolveSettlementSource(settlementSnapshot);
  const warnings: MispricingAtlasWarning[] = [];

  if (settlementOutcome === null) {
    warnings.push({
      code: "missing-settlement",
      message: formatMissingSettlementDiagnostic(
        marketTicker,
        dataset.snapshots.length,
      ),
      marketTicker,
    });

    return {
      strategyId,
      seriesTicker,
      marketTicker,
      observations: [],
      warnings,
    };
  }

  const backtestResult = parseJsonValue(researchRun.backtestResult, "backtestResult");
  const replayObservations = isRecord(backtestResult)
    ? extractReplayStepObservations({
        strategyId,
        seriesTicker,
        marketTicker,
        outputPath,
        observedOutcome: settlementOutcome,
        backtestResult,
        settlementSource,
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
          observedOutcome: settlementOutcome,
          snapshot: fallbackSnapshot,
          settlementSource,
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
    strategyId,
    seriesTicker,
    marketTicker,
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

/** Converts a cost-aware observation into a mispricing observation when quotes are valid. */
export function toMispricingObservation(
  observation: CostAwareMispricingObservation,
): import("@/lib/data/research/mispricingAtlas/mispricingAtlasTypes").MispricingObservation | null {
  if (observation.predictedProbability == null) {
    return null;
  }

  return {
    strategyId: observation.strategyId,
    seriesTicker: observation.seriesTicker,
    marketTicker: observation.marketTicker,
    outputPath: observation.outputPath,
    stepIndex: observation.stepIndex,
    predictedProbability: observation.predictedProbability,
    observedOutcome: observation.observedOutcome,
    timeRemainingMs: observation.timeRemainingMs,
    moneynessPercent: observation.moneynessPercent,
    annualizedVolatility: observation.annualizedVolatility,
    momentumPercent: observation.momentumPercent,
    tradingDayUtc: observation.tradingDayUtc,
    timestampMs: observation.timestampMs,
  };
}
