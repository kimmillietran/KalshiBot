import { computeKalshiScheduleFeeCents } from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";
import type { ExecutionFeeModel } from "@/lib/data/backtesting/costModel/executionCostModelTypes";

import type {
  CostAwareAtlasConfig,
  ImpliedCalibrationSide,
  QuoteStatus,
  SpreadCohortId,
  TradeabilityClassification,
} from "./costAwareAtlasTypes";

export type CostAwareObservationQuoteInput = {
  yesBidCents: number | null;
  yesAskCents: number | null;
  spreadPercent: number | null;
  quoteStatus: QuoteStatus;
};

export type CostAwareBucketAccumulatorState = {
  observations: number;
  validQuoteObservations: number;
  sumPredicted: number;
  predictableObservations: number;
  sumOutcome: number;
  sumHalfSpreadCents: number;
  sumFeeCents: number;
  wideSpreadObservations: number;
  missingQuoteObservations: number;
};

export function roundMetric(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function resolveQuoteStatus(
  yesBidCents: number | null | undefined,
  yesAskCents: number | null | undefined,
): QuoteStatus {
  if (yesBidCents == null && yesAskCents == null) {
    return "missing";
  }

  if (yesBidCents == null || yesAskCents == null) {
    return "one-sided";
  }

  if (
    !Number.isFinite(yesBidCents)
    || !Number.isFinite(yesAskCents)
    || yesBidCents < 0
    || yesAskCents < 0
    || yesBidCents > 100
    || yesAskCents > 100
    || yesAskCents < yesBidCents
  ) {
    return "invalid";
  }

  return "valid";
}

export function computeYesSpreadPercent(
  yesBidCents: number,
  yesAskCents: number,
): number | null {
  if (yesAskCents <= 0) {
    return null;
  }

  const spread = Math.max(yesAskCents - yesBidCents, 0);
  return (spread / yesAskCents) * 100;
}

export function computeHalfSpreadCents(
  yesBidCents: number,
  yesAskCents: number,
): number {
  return Math.max(yesAskCents - yesBidCents, 0) / 2;
}

export function classifySpreadTier(
  spreadPercent: number | null,
  config: Pick<
    CostAwareAtlasConfig,
    "tightSpreadPercentMax" | "mediumSpreadPercentMax"
  >,
): "tight" | "medium" | "wide" | "unclassified" {
  if (spreadPercent == null || !Number.isFinite(spreadPercent)) {
    return "unclassified";
  }

  if (spreadPercent <= config.tightSpreadPercentMax) {
    return "tight";
  }

  if (spreadPercent <= config.mediumSpreadPercentMax) {
    return "medium";
  }

  return "wide";
}

export function observationMatchesSpreadCohort(
  cohortId: SpreadCohortId,
  quote: CostAwareObservationQuoteInput,
  config: Pick<
    CostAwareAtlasConfig,
    "tightSpreadPercentMax" | "mediumSpreadPercentMax"
  >,
): boolean {
  switch (cohortId) {
    case "all":
      return true;
    case "validBidAsk":
      return quote.quoteStatus === "valid";
    case "missingOrInvalidQuote":
      return quote.quoteStatus !== "valid";
    case "tightSpread":
      return (
        quote.quoteStatus === "valid"
        && classifySpreadTier(quote.spreadPercent, config) === "tight"
      );
    case "mediumSpread":
      return (
        quote.quoteStatus === "valid"
        && classifySpreadTier(quote.spreadPercent, config) === "medium"
      );
    case "wideSpread":
      return (
        quote.quoteStatus === "valid"
        && classifySpreadTier(quote.spreadPercent, config) === "wide"
      );
    default:
      return false;
  }
}

export function resolveImpliedCalibrationSide(
  rawCalibrationGap: number | null,
  neutralThreshold: number,
): ImpliedCalibrationSide {
  if (rawCalibrationGap == null || !Number.isFinite(rawCalibrationGap)) {
    return "neutral";
  }

  if (rawCalibrationGap > neutralThreshold) {
    return "overconfident";
  }

  if (rawCalibrationGap < -neutralThreshold) {
    return "underconfident";
  }

  return "neutral";
}

export function computeFadeGrossExpectedValueCents(
  rawCalibrationGap: number | null,
): number | null {
  if (rawCalibrationGap == null || !Number.isFinite(rawCalibrationGap)) {
    return null;
  }

  return roundMetric(rawCalibrationGap * 100, 4);
}

export function computeExecutionFeeCents(input: {
  feeModel: ExecutionFeeModel;
  calibrationGap: number | null;
  yesBidCents: number;
  yesAskCents: number;
  quantity?: number;
}): number {
  const quantity = input.quantity ?? 1;

  if (input.feeModel.kind === "zero") {
    return 0;
  }

  if (input.feeModel.kind === "per-contract-fee") {
    return input.feeModel.feeCentsPerContract * quantity;
  }

  const fadeYes = (input.calibrationGap ?? 0) >= 0;
  const executionPriceCents = fadeYes
    ? 100 - input.yesBidCents
    : input.yesAskCents;

  return computeKalshiScheduleFeeCents({
    quantity,
    priceCents: Math.round(executionPriceCents),
    role: input.feeModel.role,
    schedule: input.feeModel.schedule,
  });
}

export function computeBucketCostMetrics(input: {
  state: CostAwareBucketAccumulatorState;
  config: CostAwareAtlasConfig;
}): {
  averageImpliedProbability: number | null;
  realizedFrequency: number | null;
  rawCalibrationGap: number | null;
  impliedSide: ImpliedCalibrationSide;
  grossExpectedValueCents: number | null;
  spreadAdjustedExpectedValueCents: number | null;
  feeAdjustedExpectedValueCents: number | null;
  minimumRequiredEdgeCents: number | null;
  averageHalfSpreadCents: number | null;
  averageFeeCents: number | null;
} {
  const { state, config } = input;

  if (state.observations === 0) {
    return {
      averageImpliedProbability: null,
      realizedFrequency: null,
      rawCalibrationGap: null,
      impliedSide: "neutral",
      grossExpectedValueCents: null,
      spreadAdjustedExpectedValueCents: null,
      feeAdjustedExpectedValueCents: null,
      minimumRequiredEdgeCents: null,
      averageHalfSpreadCents: null,
      averageFeeCents: null,
    };
  }

  const averageImpliedProbability =
    state.predictableObservations > 0
      ? state.sumPredicted / state.predictableObservations
      : null;
  const realizedFrequency = state.sumOutcome / state.observations;
  const rawCalibrationGap =
    averageImpliedProbability == null
      ? null
      : averageImpliedProbability - realizedFrequency;
  const impliedSide = resolveImpliedCalibrationSide(
    rawCalibrationGap,
    config.neutralCalibrationGapThreshold,
  );
  const grossExpectedValueCents = computeFadeGrossExpectedValueCents(
    rawCalibrationGap,
  );
  const averageHalfSpreadCents =
    state.validQuoteObservations > 0
      ? state.sumHalfSpreadCents / state.validQuoteObservations
      : null;
  const averageFeeCents =
    state.validQuoteObservations > 0
      ? state.sumFeeCents / state.validQuoteObservations
      : null;
  const minimumRequiredEdgeCents =
    averageHalfSpreadCents == null && averageFeeCents == null
      ? null
      : roundMetric((averageHalfSpreadCents ?? 0) + (averageFeeCents ?? 0), 4);

  const spreadAdjustedExpectedValueCents =
    grossExpectedValueCents == null || averageHalfSpreadCents == null
      ? grossExpectedValueCents
      : roundMetric(grossExpectedValueCents - averageHalfSpreadCents, 4);

  const feeAdjustedExpectedValueCents =
    spreadAdjustedExpectedValueCents == null || averageFeeCents == null
      ? spreadAdjustedExpectedValueCents
      : roundMetric(spreadAdjustedExpectedValueCents - averageFeeCents, 4);

  return {
    averageImpliedProbability:
      averageImpliedProbability == null
        ? null
        : roundMetric(averageImpliedProbability),
    realizedFrequency: roundMetric(realizedFrequency),
    rawCalibrationGap:
      rawCalibrationGap == null ? null : roundMetric(rawCalibrationGap),
    impliedSide,
    grossExpectedValueCents,
    spreadAdjustedExpectedValueCents,
    feeAdjustedExpectedValueCents,
    minimumRequiredEdgeCents,
    averageHalfSpreadCents:
      averageHalfSpreadCents == null
        ? null
        : roundMetric(averageHalfSpreadCents, 4),
    averageFeeCents:
      averageFeeCents == null ? null : roundMetric(averageFeeCents, 4),
  };
}

export function classifyTradeability(input: {
  observations: number;
  validQuoteObservations: number;
  wideSpreadObservations: number;
  missingQuoteObservations: number;
  grossExpectedValueCents: number | null;
  feeAdjustedExpectedValueCents: number | null;
  config: CostAwareAtlasConfig;
}): TradeabilityClassification {
  const {
    observations,
    validQuoteObservations,
    wideSpreadObservations,
    missingQuoteObservations,
    grossExpectedValueCents,
    feeAdjustedExpectedValueCents,
    config,
  } = input;

  if (observations === 0) {
    return "unknown";
  }

  if (observations < config.minSampleThreshold) {
    return "underpowered";
  }

  if (validQuoteObservations === 0) {
    return "untradeable-missing-quotes";
  }

  const missingShare = missingQuoteObservations / observations;
  const validShare = validQuoteObservations / observations;
  if (validShare < 0.5 && missingShare > validShare) {
    return "untradeable-missing-quotes";
  }

  const wideShare =
    validQuoteObservations > 0
      ? wideSpreadObservations / validQuoteObservations
      : 0;

  if (
    wideShare >= 0.5
    && (feeAdjustedExpectedValueCents ?? 0) <= config.neutralCalibrationGapThreshold * 100
  ) {
    return "untradeable-wide-spread";
  }

  if (feeAdjustedExpectedValueCents == null) {
    return "unknown";
  }

  if (feeAdjustedExpectedValueCents > config.neutralCalibrationGapThreshold * 100) {
    return "tradeable-positive";
  }

  if (
    (grossExpectedValueCents ?? 0) > config.neutralCalibrationGapThreshold * 100
    && (feeAdjustedExpectedValueCents ?? 0) <= config.neutralCalibrationGapThreshold * 100
  ) {
    return "gross-only";
  }

  if (feeAdjustedExpectedValueCents < -config.neutralCalibrationGapThreshold * 100) {
    return "tradeable-negative";
  }

  return "unknown";
}

export function createCostAwareBucketAccumulatorState(): CostAwareBucketAccumulatorState {
  return {
    observations: 0,
    validQuoteObservations: 0,
    sumPredicted: 0,
    predictableObservations: 0,
    sumOutcome: 0,
    sumHalfSpreadCents: 0,
    sumFeeCents: 0,
    wideSpreadObservations: 0,
    missingQuoteObservations: 0,
  };
}

export function addObservationToCostAwareBucketState(
  state: CostAwareBucketAccumulatorState,
  input: {
    predictedProbability: number | null;
    observedOutcome: 0 | 1;
    quote: CostAwareObservationQuoteInput;
    config: CostAwareAtlasConfig;
  },
): void {
  state.observations += 1;
  state.sumOutcome += input.observedOutcome;

  if (input.predictedProbability != null && Number.isFinite(input.predictedProbability)) {
    state.sumPredicted += input.predictedProbability;
    state.predictableObservations += 1;
  }

  if (input.quote.quoteStatus !== "valid") {
    state.missingQuoteObservations += 1;
    return;
  }

  const yesBidCents = input.quote.yesBidCents!;
  const yesAskCents = input.quote.yesAskCents!;
  state.validQuoteObservations += 1;
  state.sumHalfSpreadCents += computeHalfSpreadCents(yesBidCents, yesAskCents);

  const calibrationGap =
    input.predictedProbability == null
      ? 0
      : input.predictedProbability - input.observedOutcome;
  state.sumFeeCents += computeExecutionFeeCents({
    feeModel: input.config.feeModel,
    calibrationGap,
    yesBidCents,
    yesAskCents,
  });

  if (classifySpreadTier(input.quote.spreadPercent, input.config) === "wide") {
    state.wideSpreadObservations += 1;
  }
}

export function compareBucketEntriesDeterministically(
  left: { dimension: string; bucketId: string },
  right: { dimension: string; bucketId: string },
): number {
  const dimensionCompare = left.dimension.localeCompare(right.dimension);
  if (dimensionCompare !== 0) {
    return dimensionCompare;
  }

  return left.bucketId.localeCompare(right.bucketId);
}

export function compareRankingEntriesDeterministically(
  left: { valueCents: number; dimension: string; bucketId: string },
  right: { valueCents: number; dimension: string; bucketId: string },
  direction: "desc" | "asc",
): number {
  const valueCompare =
    direction === "desc"
      ? right.valueCents - left.valueCents
      : left.valueCents - right.valueCents;
  if (valueCompare !== 0) {
    return valueCompare;
  }

  return compareBucketEntriesDeterministically(left, right);
}
