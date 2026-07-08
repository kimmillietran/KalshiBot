import { computeFillCostBreakdown } from "@/lib/data/backtesting/costModel/computeFillCostBreakdown";
import { resolveExecutionCostModel } from "@/lib/data/backtesting/costModel/resolveExecutionCostModel";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import type {
  HypothesisTradeReplayConfig,
  HypothesisTradeReplayMetrics,
  HypothesisTradeReplaySkipReason,
  HypothesisTradeRule,
  ReplayTradeAttempt,
  ReplayableObservation,
} from "./hypothesisTradeReplayTypes";

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function isValidQuoteCents(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0 && value < 100;
}

function computeFairYesProbability(
  observation: ReplayableObservation,
  calibrationError: number,
): number {
  return Math.min(Math.max(observation.predictedProbability - calibrationError, 0), 1);
}

function computeExpectedNetEdgeCents(input: {
  rule: HypothesisTradeRule;
  observation: ReplayableObservation;
  calibrationError: number;
  entryPriceCents: number;
  feeCents: number;
  slippageBufferCents: number;
}): number {
  const fairYes = computeFairYesProbability(input.observation, input.calibrationError);
  const fairSideProbability = input.rule.side === "yes" ? fairYes : 1 - fairYes;
  const expectedGrossCents = fairSideProbability * 100 - input.entryPriceCents;
  return expectedGrossCents - input.feeCents - input.slippageBufferCents;
}

function computeSettlementGrossPnlCents(input: {
  side: HypothesisTradeRule["side"];
  entryPriceCents: number;
  observedOutcome: 0 | 1;
}): number {
  const contractWins =
    (input.side === "yes" && input.observedOutcome === 1)
    || (input.side === "no" && input.observedOutcome === 0);

  return contractWins ? 100 - input.entryPriceCents : -input.entryPriceCents;
}

function createEmptySkipReasons(): Record<HypothesisTradeReplaySkipReason, number> {
  return {
    "missing-quote": 0,
    "invalid-quote": 0,
    "wide-spread": 0,
    "insufficient-net-edge": 0,
    "unsupported-hypothesis-type": 0,
    "no-bucket-observations": 0,
  };
}

/** Replays one observation using cross-spread entry and hold-to-settlement payout. */
export function replayObservationTrade(input: {
  observation: ReplayableObservation;
  rule: HypothesisTradeRule;
  config: HypothesisTradeReplayConfig;
  calibrationError: number;
}): ReplayTradeAttempt {
  const { observation, rule, config, calibrationError } = input;
  const quote = observation.quote;

  if (!quote) {
    return {
      observation,
      rule,
      status: "skipped",
      skipReason: "missing-quote",
      entryPriceCents: null,
      spreadPaidCents: null,
      feeCents: null,
      grossPnlCents: null,
      netPnlCents: null,
      expectedNetEdgeCents: null,
    };
  }

  const bidCents = rule.side === "yes" ? quote.yesBidCents : quote.noBidCents;
  const askCents = rule.side === "yes" ? quote.yesAskCents : quote.noAskCents;

  if (!isValidQuoteCents(bidCents) || !isValidQuoteCents(askCents) || askCents < bidCents) {
    return {
      observation,
      rule,
      status: "skipped",
      skipReason: "invalid-quote",
      entryPriceCents: null,
      spreadPaidCents: null,
      feeCents: null,
      grossPnlCents: null,
      netPnlCents: null,
      expectedNetEdgeCents: null,
    };
  }

  const spreadPaidCents = askCents - bidCents;
  if (spreadPaidCents > config.maxSpreadCents) {
    return {
      observation,
      rule,
      status: "skipped",
      skipReason: "wide-spread",
      entryPriceCents: null,
      spreadPaidCents,
      feeCents: null,
      grossPnlCents: null,
      netPnlCents: null,
      expectedNetEdgeCents: null,
    };
  }

  const entryPriceCents = askCents + config.slippageBufferCents;
  const costModels = resolveExecutionCostModel(
    DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
    { executionCostModel: config.feeModel },
  );
  const feeBreakdown = computeFillCostBreakdown({
    action: "buy",
    grossPriceCents: entryPriceCents,
    quantity: 1,
    models: costModels,
  });
  const feeCents = feeBreakdown.feeCents;
  const expectedNetEdgeCents = computeExpectedNetEdgeCents({
    rule,
    observation,
    calibrationError,
    entryPriceCents,
    feeCents,
    slippageBufferCents: config.slippageBufferCents,
  });

  if (expectedNetEdgeCents < config.minNetEdgeCents) {
    return {
      observation,
      rule,
      status: "skipped",
      skipReason: "insufficient-net-edge",
      entryPriceCents,
      spreadPaidCents,
      feeCents,
      grossPnlCents: null,
      netPnlCents: null,
      expectedNetEdgeCents,
    };
  }

  const grossPnlCents = computeSettlementGrossPnlCents({
    side: rule.side,
    entryPriceCents,
    observedOutcome: observation.observedOutcome,
  });
  const netPnlCents = grossPnlCents - feeCents;

  return {
    observation,
    rule,
    status: "filled",
    skipReason: null,
    entryPriceCents,
    spreadPaidCents,
    feeCents,
    grossPnlCents,
    netPnlCents,
    expectedNetEdgeCents,
  };
}

function buildMarketTradeKey(
  observation: ReplayableObservation,
): string {
  return `${observation.strategyId}:${observation.marketTicker}`;
}

function computeMarketDependenceMetrics(
  filled: readonly ReplayTradeAttempt[],
): Pick<
  HypothesisTradeReplayMetrics,
  | "uniqueMarketCount"
  | "uniqueTradingDayCount"
  | "averageTradesPerMarket"
  | "maxTradesPerMarket"
> {
  const tradesPerMarket = new Map<string, number>();
  const tradingDays = new Set<string>();

  for (const attempt of filled) {
    const marketKey = buildMarketTradeKey(attempt.observation);
    tradesPerMarket.set(marketKey, (tradesPerMarket.get(marketKey) ?? 0) + 1);

    if (attempt.observation.tradingDayUtc) {
      tradingDays.add(attempt.observation.tradingDayUtc);
    }
  }

  const uniqueMarketCount = tradesPerMarket.size;
  const tradeCounts = [...tradesPerMarket.values()];

  return {
    uniqueMarketCount,
    uniqueTradingDayCount: tradingDays.size,
    averageTradesPerMarket:
      uniqueMarketCount > 0 ? roundMetric(filled.length / uniqueMarketCount) : null,
    maxTradesPerMarket: tradeCounts.length > 0 ? Math.max(...tradeCounts) : 0,
  };
}

function computeMaxDrawdownCents(netPnls: readonly number[]): number {
  let peak = 0;
  let cumulative = 0;
  let maxDrawdown = 0;

  for (const pnl of netPnls) {
    cumulative += pnl;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  return roundMetric(maxDrawdown);
}

/** Aggregates replay attempts into hypothesis-level metrics. */
export function computeHypothesisReplayMetrics(
  attempts: readonly ReplayTradeAttempt[],
): HypothesisTradeReplayMetrics {
  const skipReasons = createEmptySkipReasons();
  const filled = attempts.filter((attempt) => attempt.status === "filled");

  for (const attempt of attempts) {
    if (attempt.status === "skipped" && attempt.skipReason) {
      skipReasons[attempt.skipReason] += 1;
    }
  }

  const grossPnlCents = roundMetric(
    filled.reduce((sum, attempt) => sum + (attempt.grossPnlCents ?? 0), 0),
  );
  const netPnlCents = roundMetric(
    filled.reduce((sum, attempt) => sum + (attempt.netPnlCents ?? 0), 0),
  );
  const totalFees = roundMetric(
    filled.reduce((sum, attempt) => sum + (attempt.feeCents ?? 0), 0),
  );
  const totalEntry = filled.reduce((sum, attempt) => sum + (attempt.entryPriceCents ?? 0), 0);
  const totalSpread = filled.reduce((sum, attempt) => sum + (attempt.spreadPaidCents ?? 0), 0);
  const wins = filled.filter((attempt) => (attempt.netPnlCents ?? 0) > 0).length;
  const calibrationGapCents = roundMetric(
    filled.reduce((sum, attempt) => sum + (attempt.expectedNetEdgeCents ?? 0), 0),
  );

  const netSeries = filled.map((attempt) => attempt.netPnlCents ?? 0);
  const marketDependence = computeMarketDependenceMetrics(filled);

  return {
    tradeCount: filled.length,
    fillableObservationCount: attempts.length,
    skippedCount: attempts.length - filled.length,
    skipReasons,
    ...marketDependence,
    grossPnlCents,
    netPnlCents,
    averagePnlCentsPerTrade:
      filled.length > 0 ? roundMetric(netPnlCents / filled.length) : null,
    winRate: filled.length > 0 ? roundMetric(wins / filled.length) : null,
    maxDrawdownCents: computeMaxDrawdownCents(netSeries),
    exposureCount: filled.length,
    averageEntryPriceCents:
      filled.length > 0 ? roundMetric(totalEntry / filled.length) : null,
    averageSpreadPaidCents:
      filled.length > 0 ? roundMetric(totalSpread / filled.length) : null,
    averageFeeCents: filled.length > 0 ? roundMetric(totalFees / filled.length) : null,
    realizedRoi:
      totalEntry > 0 ? roundMetric(netPnlCents / totalEntry) : null,
    calibrationGapCents,
    calibrationGapVsRealizedPnlDeltaCents:
      calibrationGapCents === null
        ? null
        : roundMetric(netPnlCents - calibrationGapCents),
  };
}

export function buildHypothesisReplayWarnings(input: {
  candidate: HypothesisCandidate;
  metrics: HypothesisTradeReplayMetrics;
}): string[] {
  const warnings: string[] = [...input.candidate.warnings];

  if (input.metrics.tradeCount < 30) {
    warnings.push(
      `Replay sample size (${input.metrics.tradeCount} trades) is small; treat PnL as indicative only.`,
    );
  }

  if (
    input.metrics.tradeCount > 0
    && input.metrics.uniqueMarketCount > 0
    && input.metrics.tradeCount > input.metrics.uniqueMarketCount
  ) {
    warnings.push(
      `Replay allows repeated entries across replay steps (${input.metrics.tradeCount} filled trades across ${input.metrics.uniqueMarketCount} markets; max ${input.metrics.maxTradesPerMarket} per market). Trades are temporally dependent and not independent bets.`,
    );
  }

  const uniqueDays = input.candidate.bucketMetadata?.uniqueTradingDays;
  if (uniqueDays !== null && uniqueDays !== undefined && uniqueDays < 5) {
    warnings.push(
      `Bucket spans only ${uniqueDays} unique trading days; replay trades are temporally dependent.`,
    );
  }

  if (input.metrics.tradeCount === 0 && input.metrics.fillableObservationCount > 0) {
    warnings.push(
      "All bucket observations were skipped by spread, edge, or quote filters; hypothesis is untradeable under current execution assumptions.",
    );
  }

  return [...new Set(warnings)];
}

export function resolveCalibrationError(candidate: HypothesisCandidate): number {
  return candidate.bucketMetadata?.calibrationError ?? 0;
}
