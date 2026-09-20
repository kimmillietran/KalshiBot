import { createHash } from "node:crypto";

import { RESPONSE_MATCH_TOLERANCE_MS } from "@/lib/data/research/kalshiTobMomentumFamily";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildM16SettlementFallbackSpec, buildM16TradePolicySpec } from "./m16EconomicsPolicy";
import { bindM16FeeContract } from "./m16Types";
import {
  M16_ANALYSIS_VERSION,
  M16_CLUSTER_UNIT,
  M16_DISCLAIMER,
  M16_FAMILY_DEFINITION_VERSION,
  M16_FAMILY_ID,
  M16_MAX_FUTURE_CAPTURE_BUDGET_HOURS,
  M16_MIN_REMAINING_MS_AT_CONFIRMATION,
  M16_PRIMARY_PLANNING_MEAN_EFFECT_CENTS,
  M16_PRIMARY_PLANNING_SD_CENTS,
  M16_SETUP_ABORT_LOW_CENTS,
  M16_SETUP_CROSS_CENTS,
  M16_STRUCTURE_TICK_CENTS,
  M16_SUBFAMILY_ID,
  M16_TARGET_BID_CENTS,
  M16_TARGET_INDEPENDENT_TRADE_N,
} from "./m16Types";

export type M16FamilyDefinition = {
  analysisVersion: typeof M16_ANALYSIS_VERSION;
  familyId: typeof M16_FAMILY_ID;
  subfamilyId: typeof M16_SUBFAMILY_ID;
  definitionVersion: typeof M16_FAMILY_DEFINITION_VERSION;
  disclaimer: typeof M16_DISCLAIMER;
  historicalPriorSummary: readonly string[];
  researcherInventions: readonly string[];
  fidelityLimitation: string;
  signalSeries: "candidate-side-complement-midpoint";
  priceRepresentation: "legacy-no-leg";
  candidateSideRule: "unique-side-performing-down-cross-into-depressed-region";
  oneEntryPerMarketTicker: true;
  setup: {
    downCross: string;
    runningLowL: "min-candidate-mid-since-down-cross-strict-decreases-only";
    abortIfLBelow: typeof M16_SETUP_ABORT_LOW_CENTS;
  };
  confirmationStateMachine: {
    offLowTicks: typeof M16_STRUCTURE_TICK_CENTS;
    reboundHighH: "max-mid-since-most-recent-new-low-after-off-low";
    pullbackTicks: typeof M16_STRUCTURE_TICK_CENTS;
    pullbackHoldsLow: true;
    higherHighConfirmation: "first-mid-strictly-greater-than-H";
    confirmationMayExceedSetupBand: true;
    noCenteredPivots: true;
    orderingSemantics: "jsonl-file-append-order-pr94";
  };
  remainingTimeGateMs: typeof M16_MIN_REMAINING_MS_AT_CONFIRMATION;
  leftTruncation: "fail-closed-unless-complete-prehistory-above-cross-observed";
  gapSemantics: "structural-interval-gap-invalidates-setup-fail-closed";
  tradePolicy: ReturnType<typeof buildM16TradePolicySpec>;
  settlementFallback: ReturnType<typeof buildM16SettlementFallbackSpec>;
  feeContract: ReturnType<typeof bindM16FeeContract>;
  clusterUnit: typeof M16_CLUSTER_UNIT;
  primaryEventualEstimand: "mean-one-contract-fee-adjusted-executable-pnl";
  falsificationRule: "mean-fee-adjusted-executable-pnl-leq-0-at-adequate-N-stops-family";
  contaminationExclusions: readonly string[];
  planning: {
    targetIndependentTradeN: typeof M16_TARGET_INDEPENDENT_TRADE_N;
    primaryPlanningMeanEffectCents: typeof M16_PRIMARY_PLANNING_MEAN_EFFECT_CENTS;
    primaryPlanningSdCents: typeof M16_PRIMARY_PLANNING_SD_CENTS;
    maxFutureCaptureBudgetHours: typeof M16_MAX_FUTURE_CAPTURE_BUDGET_HOURS;
  };
  responseMatchToleranceMs: typeof RESPONSE_MATCH_TOLERANCE_MS;
  targetBidCents: typeof M16_TARGET_BID_CENTS;
  familyDefinitionIdentity: string;
};

export function buildM16FamilyDefinition(): M16FamilyDefinition {
  const feeContract = bindM16FeeContract();
  const definition: Omit<M16FamilyDefinition, "familyDefinitionIdentity"> = {
    analysisVersion: M16_ANALYSIS_VERSION,
    familyId: M16_FAMILY_ID,
    subfamilyId: M16_SUBFAMILY_ID,
    definitionVersion: M16_FAMILY_DEFINITION_VERSION,
    disclaimer: M16_DISCLAIMER,
    historicalPriorSummary: [
      "either YES or NO could be traded (side-invariant)",
      "interest centered on depressed side around 30–40",
      "reaching 30–40 alone was NOT an entry",
      "continuing new lows meant possible ongoing collapse",
      "failure to continue making lows mattered",
      "local rebound / higher-high structure mattered",
      "willing to miss absolute bottom for confirmation",
      "recovery toward ~55 could monetize; 60–70 optimistic not mandatory",
      "human impatience motivated automation",
    ],
    researcherInventions: [
      "complement-midpoint as explicit mechanical PROXY for UI last-price",
      "exact >40→<=40 down-cross setup",
      "L<30 pre-confirmation abort boundary",
      "1¢ off-low / 1¢ pullback structural ticks",
      "exact higher-high confirmation mid > H",
      "60s remaining-time gate",
      "target bid >=55 / structural stop bid < L / terminal flatten",
      "mean fee-adjusted executable P&L as primary eventual estimand",
    ],
    fidelityLimitation:
      "Historical user likely watched a Kalshi UI display/last-price representation. "
      + "Current canonical capture does NOT contain a first-class last-trade path "
      + "equivalent to that visual series. M16 therefore tests a complement-mid "
      + "reversal PROXY, not the exact historical discretionary UI strategy. "
      + "No synthetic last-price series is fabricated.",
    signalSeries: "candidate-side-complement-midpoint",
    priceRepresentation: "legacy-no-leg",
    candidateSideRule: "unique-side-performing-down-cross-into-depressed-region",
    oneEntryPerMarketTicker: true,
    setup: {
      downCross: `candidateMid > ${M16_SETUP_CROSS_CENTS} then <= ${M16_SETUP_CROSS_CENTS}`,
      runningLowL: "min-candidate-mid-since-down-cross-strict-decreases-only",
      abortIfLBelow: M16_SETUP_ABORT_LOW_CENTS,
    },
    confirmationStateMachine: {
      offLowTicks: M16_STRUCTURE_TICK_CENTS,
      reboundHighH: "max-mid-since-most-recent-new-low-after-off-low",
      pullbackTicks: M16_STRUCTURE_TICK_CENTS,
      pullbackHoldsLow: true,
      higherHighConfirmation: "first-mid-strictly-greater-than-H",
      confirmationMayExceedSetupBand: true,
      noCenteredPivots: true,
      orderingSemantics: "jsonl-file-append-order-pr94",
    },
    remainingTimeGateMs: M16_MIN_REMAINING_MS_AT_CONFIRMATION,
    leftTruncation: "fail-closed-unless-complete-prehistory-above-cross-observed",
    gapSemantics: "structural-interval-gap-invalidates-setup-fail-closed",
    tradePolicy: buildM16TradePolicySpec(),
    settlementFallback: buildM16SettlementFallbackSpec(),
    feeContract,
    clusterUnit: M16_CLUSTER_UNIT,
    primaryEventualEstimand: "mean-one-contract-fee-adjusted-executable-pnl",
    falsificationRule: "mean-fee-adjusted-executable-pnl-leq-0-at-adequate-N-stops-family",
    contaminationExclusions: [
      "m14-validation-captures",
      "m14-failed-segment-6",
      "m15-cost-floor-outcome-bearing-reuse",
      "holdout",
      "btc-spot-candle-conditioning",
      "order-book-size-imbalance",
      "parameter-grid-search",
      "outcome-bearing-train-leaderboard",
    ],
    planning: {
      targetIndependentTradeN: M16_TARGET_INDEPENDENT_TRADE_N,
      primaryPlanningMeanEffectCents: M16_PRIMARY_PLANNING_MEAN_EFFECT_CENTS,
      primaryPlanningSdCents: M16_PRIMARY_PLANNING_SD_CENTS,
      maxFutureCaptureBudgetHours: M16_MAX_FUTURE_CAPTURE_BUDGET_HOURS,
    },
    responseMatchToleranceMs: RESPONSE_MATCH_TOLERANCE_MS,
    targetBidCents: M16_TARGET_BID_CENTS,
  };

  const familyDefinitionIdentity = createHash("sha256")
    .update(stableStringify(definition))
    .digest("hex");

  return { ...definition, familyDefinitionIdentity };
}
