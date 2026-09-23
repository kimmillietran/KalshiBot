/**
 * M16-ER post-confirmation executable outcome path (synthetic-tested).
 *
 * Frozen semantics (m16ErProtocol buildM16ErExecutionSemantics + m16EconomicsPolicy):
 * - Entry: candidate-side executable ASK at confirmation observation
 * - Target: first eligible candidate BID >= 55
 * - Structural stop: first eligible candidate BID strictly below setup low L
 * - Terminal: last eligible candidate BID at/before close
 * - Settlement fallback: not used as primary exit; unevaluable if terminal missing
 * - Fees: authoritative STANDARD taker at entry ask + exit bid
 * - Midpoint never used as fill
 *
 * This module MUST be validated against synthetic fixtures only before any
 * real CryptoStruct economic path is evaluated.
 */

import { computeM16AuthoritativeOneContractTakerFeeCents } from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16AuthoritativeFeeContract";
import {
  candidateSideExecutableAskCents,
  candidateSideExecutableBidCents,
  isM16StructuralStop,
  isM16TargetBid,
} from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16EconomicsPolicy";
import { computeM16Cr2ClusterMeanInference } from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16Cr2ClusterMean";
import type { M16CandidateSide } from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16Types";
import { M16_TARGET_BID_CENTS } from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16Types";

import {
  buildM16ErFeeContract,
  buildM16ErEvidenceContract,
  M16_ER_ROLE,
} from "./m16ErProtocol";

export const M16_ER_EXIT_ROUTES = [
  "target",
  "structural-stop",
  "terminal-flatten",
  "unevaluable-missing-entry-ask",
  "unevaluable-missing-terminal-bid",
] as const;

export type M16ErExitRoute = (typeof M16_ER_EXIT_ROUTES)[number];

export type M16ErPostConfirmationTick = {
  timestampMs: number;
  yesBestBidCents: number;
  noBestBidCents: number;
  bookEligible: boolean;
};

export type M16ErConfirmationContext = {
  side: M16CandidateSide;
  setupLowL: number;
  confirmationTimestampMs: number;
  closeTimeMs: number;
  /** Book state at the confirmation observation (entry ask source). */
  confirmationYesBestBidCents: number;
  confirmationNoBestBidCents: number;
  confirmationBookEligible: boolean;
  utcDayKey: string;
  ticker: string;
};

export type M16ErEvaluableTrade = {
  evaluable: true;
  ticker: string;
  side: M16CandidateSide;
  utcDayKey: string;
  confirmationTimestampMs: number;
  exitTimestampMs: number;
  setupLowL: number;
  entryAskCents: number;
  exitBidCents: number;
  exitRoute: "target" | "structural-stop" | "terminal-flatten";
  grossPnlCents: number;
  entryFeeCents: number;
  exitFeeCents: number;
  feeCents: number;
  feeAdjustedPnlCents: number;
  holdingTimeMs: number;
};

export type M16ErUnevaluableTrade = {
  evaluable: false;
  ticker: string;
  side: M16CandidateSide;
  utcDayKey: string;
  confirmationTimestampMs: number;
  setupLowL: number;
  exitRoute: "unevaluable-missing-entry-ask" | "unevaluable-missing-terminal-bid";
  reason: string;
};

export type M16ErTradeOutcome = M16ErEvaluableTrade | M16ErUnevaluableTrade;

function assertFeeContractBound(): void {
  const fee = buildM16ErFeeContract();
  if (!fee.bindsExistingM16FeeSemantics) {
    throw new Error("M16-ER fee contract must bind existing M16 fee semantics");
  }
}

/**
 * Walk post-confirmation eligible ticks causally until target, stop, or close.
 * Only bookEligible ticks participate. Midpoint is never used as a fill.
 */
export function evaluateM16ErPostConfirmationPath(
  context: M16ErConfirmationContext,
  postConfirmationTicks: readonly M16ErPostConfirmationTick[],
): M16ErTradeOutcome {
  assertFeeContractBound();

  if (!context.confirmationBookEligible) {
    return {
      evaluable: false,
      ticker: context.ticker,
      side: context.side,
      utcDayKey: context.utcDayKey,
      confirmationTimestampMs: context.confirmationTimestampMs,
      setupLowL: context.setupLowL,
      exitRoute: "unevaluable-missing-entry-ask",
      reason: "confirmation-book-not-eligible",
    };
  }

  let entryAskCents: number;
  try {
    entryAskCents = candidateSideExecutableAskCents({
      side: context.side,
      yesBestBidCents: context.confirmationYesBestBidCents,
      noBestBidCents: context.confirmationNoBestBidCents,
    });
  } catch {
    return {
      evaluable: false,
      ticker: context.ticker,
      side: context.side,
      utcDayKey: context.utcDayKey,
      confirmationTimestampMs: context.confirmationTimestampMs,
      setupLowL: context.setupLowL,
      exitRoute: "unevaluable-missing-entry-ask",
      reason: "confirmation-ask-unresolvable",
    };
  }

  if (!Number.isInteger(entryAskCents) || entryAskCents < 0 || entryAskCents > 100) {
    return {
      evaluable: false,
      ticker: context.ticker,
      side: context.side,
      utcDayKey: context.utcDayKey,
      confirmationTimestampMs: context.confirmationTimestampMs,
      setupLowL: context.setupLowL,
      exitRoute: "unevaluable-missing-entry-ask",
      reason: "confirmation-ask-out-of-range",
    };
  }

  let lastEligibleBid: { bidCents: number; timestampMs: number } | null = null;

  for (const tick of postConfirmationTicks) {
    if (tick.timestampMs <= context.confirmationTimestampMs) continue;
    if (tick.timestampMs > context.closeTimeMs) break;
    if (!tick.bookEligible) continue;

    const bidCents = candidateSideExecutableBidCents({
      side: context.side,
      yesBestBidCents: tick.yesBestBidCents,
      noBestBidCents: tick.noBestBidCents,
    });
    if (!Number.isFinite(bidCents)) continue;

    lastEligibleBid = { bidCents, timestampMs: tick.timestampMs };

    if (isM16TargetBid(bidCents)) {
      return finalizeEvaluable({
        context,
        entryAskCents,
        exitBidCents: bidCents,
        exitTimestampMs: tick.timestampMs,
        exitRoute: "target",
      });
    }
    if (
      isM16StructuralStop({
        bidCents,
        setupLowLCents: context.setupLowL,
      })
    ) {
      return finalizeEvaluable({
        context,
        entryAskCents,
        exitBidCents: bidCents,
        exitTimestampMs: tick.timestampMs,
        exitRoute: "structural-stop",
      });
    }
  }

  if (lastEligibleBid == null) {
    return {
      evaluable: false,
      ticker: context.ticker,
      side: context.side,
      utcDayKey: context.utcDayKey,
      confirmationTimestampMs: context.confirmationTimestampMs,
      setupLowL: context.setupLowL,
      exitRoute: "unevaluable-missing-terminal-bid",
      reason: "no-eligible-post-confirmation-bid-before-close",
    };
  }

  return finalizeEvaluable({
    context,
    entryAskCents,
    exitBidCents: lastEligibleBid.bidCents,
    exitTimestampMs: lastEligibleBid.timestampMs,
    exitRoute: "terminal-flatten",
  });
}

function finalizeEvaluable(input: {
  context: M16ErConfirmationContext;
  entryAskCents: number;
  exitBidCents: number;
  exitTimestampMs: number;
  exitRoute: "target" | "structural-stop" | "terminal-flatten";
}): M16ErEvaluableTrade {
  const exitBidInt = Math.round(input.exitBidCents);
  const entryFeeCents = computeM16AuthoritativeOneContractTakerFeeCents(
    input.entryAskCents,
  );
  const exitFeeCents = computeM16AuthoritativeOneContractTakerFeeCents(exitBidInt);
  const grossPnlCents = exitBidInt - input.entryAskCents;
  const feeCents = entryFeeCents + exitFeeCents;
  return {
    evaluable: true,
    ticker: input.context.ticker,
    side: input.context.side,
    utcDayKey: input.context.utcDayKey,
    confirmationTimestampMs: input.context.confirmationTimestampMs,
    exitTimestampMs: input.exitTimestampMs,
    setupLowL: input.context.setupLowL,
    entryAskCents: input.entryAskCents,
    exitBidCents: exitBidInt,
    exitRoute: input.exitRoute,
    grossPnlCents,
    entryFeeCents,
    exitFeeCents,
    feeCents,
    feeAdjustedPnlCents: grossPnlCents - feeCents,
    holdingTimeMs: input.exitTimestampMs - input.context.confirmationTimestampMs,
  };
}

export type M16ErPrimaryEconomicResult = {
  role: typeof M16_ER_ROLE;
  estimand: "mean-one-contract-fee-adjusted-executable-pnl";
  blindConfirmations: number;
  economicallyEvaluableN: number;
  unevaluableCount: number;
  unevaluableReasonCounts: Record<string, number>;
  primaryN: number;
  primaryG: number;
  meanGrossPnlCents: number;
  meanFeeCents: number;
  meanFeeAdjustedPnlCents: number;
  cr2StandardErrorCents: number;
  tStatistic: number;
  degreesOfFreedom: number;
  oneSidedPValue: number;
  rejectsNullAtAlpha05: boolean;
  supportCriterionMet: boolean;
  hypothesisDecision: "reject-H0" | "fail-to-reject-H0";
  protocolDisposition:
    | "STATISTICALLY_SIGNIFICANT_POSITIVE_MEAN_FEE_ADJUSTED_EXECUTABLE_PNL"
    | "NO_STATISTICALLY_SIGNIFICANT_POSITIVE_MEAN_FEE_ADJUSTED_EXECUTABLE_PNL"
    | "UNDERPOWERED_OR_NON_EVALUABLE_AFTER_OUTCOME_OPEN";
  targetBidCents: typeof M16_TARGET_BID_CENTS;
  evidenceContractIdentity: string;
};

/**
 * Primary analysis from evaluable trades only.
 * If N/G fall below frozen adequacy after unevaluable exclusions → underpowered disposition.
 */
export function buildM16ErPrimaryEconomicResult(input: {
  outcomes: readonly M16ErTradeOutcome[];
  blindConfirmations: number;
  requiredN: number;
  requiredG: number;
}): M16ErPrimaryEconomicResult {
  const evidence = buildM16ErEvidenceContract();
  const evaluable = input.outcomes.filter(
    (o): o is M16ErEvaluableTrade => o.evaluable,
  );
  const unevaluable = input.outcomes.filter((o) => !o.evaluable);
  const unevaluableReasonCounts: Record<string, number> = {};
  for (const u of unevaluable) {
    const key = u.exitRoute;
    unevaluableReasonCounts[key] = (unevaluableReasonCounts[key] ?? 0) + 1;
  }

  const primaryN = evaluable.length;
  const clusters = new Set(evaluable.map((t) => t.utcDayKey));
  const primaryG = clusters.size;

  if (primaryN < input.requiredN || primaryG < input.requiredG || primaryN === 0) {
    return {
      role: M16_ER_ROLE,
      estimand: "mean-one-contract-fee-adjusted-executable-pnl",
      blindConfirmations: input.blindConfirmations,
      economicallyEvaluableN: primaryN,
      unevaluableCount: unevaluable.length,
      unevaluableReasonCounts,
      primaryN,
      primaryG,
      meanGrossPnlCents: Number.NaN,
      meanFeeCents: Number.NaN,
      meanFeeAdjustedPnlCents: Number.NaN,
      cr2StandardErrorCents: Number.NaN,
      tStatistic: Number.NaN,
      degreesOfFreedom: Math.max(0, primaryG - 1),
      oneSidedPValue: Number.NaN,
      rejectsNullAtAlpha05: false,
      supportCriterionMet: false,
      hypothesisDecision: "fail-to-reject-H0",
      protocolDisposition: "UNDERPOWERED_OR_NON_EVALUABLE_AFTER_OUTCOME_OPEN",
      targetBidCents: M16_TARGET_BID_CENTS,
      evidenceContractIdentity: evidence.evidenceContractIdentity,
    };
  }

  const meanGross =
    evaluable.reduce((s, t) => s + t.grossPnlCents, 0) / primaryN;
  const meanFee = evaluable.reduce((s, t) => s + t.feeCents, 0) / primaryN;
  const cr2 = computeM16Cr2ClusterMeanInference(
    evaluable.map((t) => ({
      clusterKey: t.utcDayKey,
      valueCents: t.feeAdjustedPnlCents,
    })),
  );

  const rejects = cr2.rejectsNullAtAlpha05;
  return {
    role: M16_ER_ROLE,
    estimand: "mean-one-contract-fee-adjusted-executable-pnl",
    blindConfirmations: input.blindConfirmations,
    economicallyEvaluableN: primaryN,
    unevaluableCount: unevaluable.length,
    unevaluableReasonCounts,
    primaryN: cr2.n,
    primaryG: cr2.g,
    meanGrossPnlCents: meanGross,
    meanFeeCents: meanFee,
    meanFeeAdjustedPnlCents: cr2.sampleMeanCents,
    cr2StandardErrorCents: cr2.cr2StandardError,
    tStatistic: cr2.tStatistic,
    degreesOfFreedom: cr2.degreesOfFreedom,
    oneSidedPValue: cr2.oneSidedPValueGreaterThanZero,
    rejectsNullAtAlpha05: rejects,
    supportCriterionMet: cr2.supportCriterionMet,
    hypothesisDecision: rejects ? "reject-H0" : "fail-to-reject-H0",
    protocolDisposition: rejects
      ? "STATISTICALLY_SIGNIFICANT_POSITIVE_MEAN_FEE_ADJUSTED_EXECUTABLE_PNL"
      : "NO_STATISTICALLY_SIGNIFICANT_POSITIVE_MEAN_FEE_ADJUSTED_EXECUTABLE_PNL",
    targetBidCents: M16_TARGET_BID_CENTS,
    evidenceContractIdentity: evidence.evidenceContractIdentity,
  };
}

export type M16ErEconomicDiagnostics = {
  medianNetPnlCents: number;
  sdNetPnlCents: number;
  percentiles: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  minNetPnlCents: number;
  maxNetPnlCents: number;
  netPositiveFraction: number;
  netZeroFraction: number;
  meanGrossPnlCents: number;
  meanFeeCents: number;
  meanEntryAskCents: number;
  meanExitBidCents: number;
  meanHoldingTimeMs: number;
  medianHoldingTimeMs: number;
  exitRouteCounts: Record<string, number>;
  exitRouteRates: Record<string, number>;
  meanNetByExitRoute: Record<string, number | null>;
  yesSide: { count: number; meanNetPnlCents: number | null };
  noSide: { count: number; meanNetPnlCents: number | null };
};

function percentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const w = idx - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

export function buildM16ErEconomicDiagnostics(
  outcomes: readonly M16ErTradeOutcome[],
): M16ErEconomicDiagnostics {
  const evaluable = outcomes.filter(
    (o): o is M16ErEvaluableTrade => o.evaluable,
  );
  const nets = evaluable.map((t) => t.feeAdjustedPnlCents).sort((a, b) => a - b);
  const n = nets.length;
  const mean = (xs: number[]) =>
    xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
  const median = n === 0
    ? Number.NaN
    : n % 2 === 1
      ? nets[(n - 1) / 2]!
      : (nets[n / 2 - 1]! + nets[n / 2]!) / 2;
  const mu = mean(nets);
  const sd =
    n < 2
      ? Number.NaN
      : Math.sqrt(
          nets.reduce((s, x) => s + (x - mu) * (x - mu), 0) / (n - 1),
        );

  const exitRouteCounts: Record<string, number> = {};
  for (const o of outcomes) {
    exitRouteCounts[o.exitRoute] = (exitRouteCounts[o.exitRoute] ?? 0) + 1;
  }
  const total = outcomes.length || 1;
  const exitRouteRates: Record<string, number> = {};
  for (const [k, v] of Object.entries(exitRouteCounts)) {
    exitRouteRates[k] = v / total;
  }
  const meanNetByExitRoute: Record<string, number | null> = {};
  for (const route of ["target", "structural-stop", "terminal-flatten"] as const) {
    const xs = evaluable
      .filter((t) => t.exitRoute === route)
      .map((t) => t.feeAdjustedPnlCents);
    meanNetByExitRoute[route] = xs.length === 0 ? null : mean(xs);
  }

  const yes = evaluable.filter((t) => t.side === "YES");
  const no = evaluable.filter((t) => t.side === "NO");
  const holdings = evaluable.map((t) => t.holdingTimeMs).sort((a, b) => a - b);

  return {
    medianNetPnlCents: median,
    sdNetPnlCents: sd,
    percentiles: {
      p10: percentileSorted(nets, 0.1),
      p25: percentileSorted(nets, 0.25),
      p50: percentileSorted(nets, 0.5),
      p75: percentileSorted(nets, 0.75),
      p90: percentileSorted(nets, 0.9),
    },
    minNetPnlCents: n === 0 ? Number.NaN : nets[0]!,
    maxNetPnlCents: n === 0 ? Number.NaN : nets[n - 1]!,
    netPositiveFraction: n === 0 ? Number.NaN : nets.filter((x) => x > 0).length / n,
    netZeroFraction: n === 0 ? Number.NaN : nets.filter((x) => x === 0).length / n,
    meanGrossPnlCents: mean(evaluable.map((t) => t.grossPnlCents)),
    meanFeeCents: mean(evaluable.map((t) => t.feeCents)),
    meanEntryAskCents: mean(evaluable.map((t) => t.entryAskCents)),
    meanExitBidCents: mean(evaluable.map((t) => t.exitBidCents)),
    meanHoldingTimeMs: mean(holdings),
    medianHoldingTimeMs:
      holdings.length === 0
        ? Number.NaN
        : holdings.length % 2 === 1
          ? holdings[(holdings.length - 1) / 2]!
          : (holdings[holdings.length / 2 - 1]!
            + holdings[holdings.length / 2]!)
            / 2,
    exitRouteCounts,
    exitRouteRates,
    meanNetByExitRoute,
    yesSide: {
      count: yes.length,
      meanNetPnlCents:
        yes.length === 0 ? null : mean(yes.map((t) => t.feeAdjustedPnlCents)),
    },
    noSide: {
      count: no.length,
      meanNetPnlCents:
        no.length === 0 ? null : mean(no.map((t) => t.feeAdjustedPnlCents)),
    },
  };
}

export type M16ErDayClusterDiagnostics = {
  dayCount: number;
  positiveMeanDays: number;
  negativeMeanDays: number;
  zeroMeanDays: number;
  medianDailyMeanCents: number;
  minDailyMeanCents: number;
  maxDailyMeanCents: number;
  days: Array<{ utcDayKey: string; n: number; meanNetPnlCents: number }>;
};

export function buildM16ErDayClusterDiagnostics(
  outcomes: readonly M16ErTradeOutcome[],
): M16ErDayClusterDiagnostics {
  const evaluable = outcomes.filter(
    (o): o is M16ErEvaluableTrade => o.evaluable,
  );
  const byDay = new Map<string, number[]>();
  for (const t of evaluable) {
    const list = byDay.get(t.utcDayKey) ?? [];
    list.push(t.feeAdjustedPnlCents);
    byDay.set(t.utcDayKey, list);
  }
  const days = [...byDay.entries()]
    .map(([utcDayKey, vals]) => ({
      utcDayKey,
      n: vals.length,
      meanNetPnlCents: vals.reduce((a, b) => a + b, 0) / vals.length,
    }))
    .sort((a, b) => a.utcDayKey.localeCompare(b.utcDayKey));
  const means = days.map((d) => d.meanNetPnlCents).sort((a, b) => a - b);
  return {
    dayCount: days.length,
    positiveMeanDays: days.filter((d) => d.meanNetPnlCents > 0).length,
    negativeMeanDays: days.filter((d) => d.meanNetPnlCents < 0).length,
    zeroMeanDays: days.filter((d) => d.meanNetPnlCents === 0).length,
    medianDailyMeanCents:
      means.length === 0
        ? Number.NaN
        : means.length % 2 === 1
          ? means[(means.length - 1) / 2]!
          : (means[means.length / 2 - 1]! + means[means.length / 2]!) / 2,
    minDailyMeanCents: means.length === 0 ? Number.NaN : means[0]!,
    maxDailyMeanCents: means.length === 0 ? Number.NaN : means[means.length - 1]!,
    days,
  };
}
