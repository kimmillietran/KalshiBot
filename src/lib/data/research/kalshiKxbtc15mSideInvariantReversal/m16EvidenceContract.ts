/**
 * M16.1a confirmatory evidence contract (v2) — supersedes M16.1 v1.
 * Does NOT evaluate real P&L. Synthetic tests only for decision-rule plumbing.
 */
import { createHash } from "node:crypto";

import {
  computeRequiredSampleSize,
  NORMAL_Z_ONE_TAILED_ALPHA_005,
  NORMAL_Z_POWER_080,
} from "@/lib/data/research/powerAnalysis/powerAnalysisMath";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { M16_CR2_INFERENCE_METHOD } from "./m16Cr2ClusterMean";
import {
  buildM16DependencePlan,
  computeM16ClusteredPlanningTradeN,
  M16_MIN_UTC_DAY_CLUSTERS,
  M16_PLANNING_AVG_TRADES_PER_UTC_DAY,
  M16_PLANNING_WITHIN_UTC_DAY_ICC,
} from "./m16DependencePlan";
import {
  M16_1A_AMENDMENT_REASON,
  M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY,
} from "./m16PriorContractIdentities";
import { M16_SUBFAMILY_ID } from "./m16Types";

export const M16_EVIDENCE_CONTRACT_VERSION =
  "kalshi-kxbtc15m-side-invariant-exhaustion-reversal-evidence-contract-v2" as const;

export const M16_EVIDENCE_ALPHA = 0.05 as const;
export const M16_EVIDENCE_TARGET_POWER = 0.8 as const;
export const M16_EVIDENCE_MDE_CENTS = 5 as const;
export const M16_EVIDENCE_PLANNING_SD_CENTS = 25 as const;
export const M16_EVIDENCE_SIDEDNESS = "one-sided" as const;

export const M16_H0 = "mean-fee-adjusted-executable-pnl-leq-0" as const;
export const M16_H1 = "mean-fee-adjusted-executable-pnl-gt-0" as const;

export type M16ValidationVerdictStatus =
  | "validation-supported"
  | "validation-failed"
  | "validation-underpowered"
  | "validation-invalid";

export type M16EvidenceContract = {
  contractVersion: typeof M16_EVIDENCE_CONTRACT_VERSION;
  subfamilyId: typeof M16_SUBFAMILY_ID;
  milestone: "m16.1a-confirmatory-evidence-contract";
  supersedesEvidenceContractIdentity: typeof M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY;
  amendmentReason: typeof M16_1A_AMENDMENT_REASON;
  economicOutcomesOpenedBeforeAmendment: false;
  hypothesis: {
    h0: typeof M16_H0;
    h1: typeof M16_H1;
    primaryEstimand: "mean-one-contract-fee-adjusted-executable-pnl";
    sidedness: typeof M16_EVIDENCE_SIDEDNESS;
    direction: "positive-expectancy";
    medianIsNotPrimary: true;
  };
  designAssumptions: {
    alpha: typeof M16_EVIDENCE_ALPHA;
    targetPower: typeof M16_EVIDENCE_TARGET_POWER;
    mdeCents: typeof M16_EVIDENCE_MDE_CENTS;
    planningTradeLevelSdCents: typeof M16_EVIDENCE_PLANNING_SD_CENTS;
    zAlphaOneSided: typeof NORMAL_Z_ONE_TAILED_ALPHA_005;
    zBetaPower80: typeof NORMAL_Z_POWER_080;
    planningWithinUtcDayIcc: typeof M16_PLANNING_WITHIN_UTC_DAY_ICC;
    planningAvgTradesPerUtcDay: typeof M16_PLANNING_AVG_TRADES_PER_UTC_DAY;
    note: string;
  };
  iidBaseline: {
    method: "ceil-((z_alpha+z_beta)*sd/mde)^2";
    iidBaselineTradeN: number;
    note: "IID baseline only — NOT the authoritative clustered collection N.";
  };
  dependencePlanIdentity: string;
  primaryInferenceMethod: typeof M16_CR2_INFERENCE_METHOD;
  collectionTargets: {
    iidBaselineTradeN: number;
    requiredTradeN: number;
    minimumUtcDayClusters: typeof M16_MIN_UTC_DAY_CLUSTERS;
    jointRule: "tradeN-and-utcDayClusters-both-required";
    requiredTradeNDerivation: "ceil-iidBaseline-times-designEffect-rho-0.10";
  };
  decisionRules: {
    support: string;
    failStopLineage: string;
    underpowered: string;
    invalid: string;
    nextActionIfSupported: "eligible-for-fresh-holdout";
    nextActionIfFailed: "stop-lineage";
    noRescueMetrics: readonly string[];
    diagnosticOnlyAfterOutcomeOpen: readonly string[];
  };
  evidenceContractIdentity: string;
};

export function computeM16IidBaselineTradeN(): number {
  const n = computeRequiredSampleSize({
    edgeCents: M16_EVIDENCE_MDE_CENTS,
    standardDeviation: M16_EVIDENCE_PLANNING_SD_CENTS,
    alpha: M16_EVIDENCE_ALPHA,
    targetPower: M16_EVIDENCE_TARGET_POWER,
  });
  if (n == null) {
    throw new Error("M16 IID baseline N computation failed");
  }
  return n;
}

export function buildM16EvidenceContract(): M16EvidenceContract {
  const dependence = buildM16DependencePlan();
  const iidBaselineTradeN = computeM16IidBaselineTradeN();
  const requiredTradeN = computeM16ClusteredPlanningTradeN({
    iidBaselineTradeN,
  });

  const contract: Omit<M16EvidenceContract, "evidenceContractIdentity"> = {
    contractVersion: M16_EVIDENCE_CONTRACT_VERSION,
    subfamilyId: M16_SUBFAMILY_ID,
    milestone: "m16.1a-confirmatory-evidence-contract",
    supersedesEvidenceContractIdentity: M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY,
    amendmentReason: M16_1A_AMENDMENT_REASON,
    economicOutcomesOpenedBeforeAmendment: false,
    hypothesis: {
      h0: M16_H0,
      h1: M16_H1,
      primaryEstimand: "mean-one-contract-fee-adjusted-executable-pnl",
      sidedness: M16_EVIDENCE_SIDEDNESS,
      direction: "positive-expectancy",
      medianIsNotPrimary: true,
    },
    designAssumptions: {
      alpha: M16_EVIDENCE_ALPHA,
      targetPower: M16_EVIDENCE_TARGET_POWER,
      mdeCents: M16_EVIDENCE_MDE_CENTS,
      planningTradeLevelSdCents: M16_EVIDENCE_PLANNING_SD_CENTS,
      zAlphaOneSided: NORMAL_Z_ONE_TAILED_ALPHA_005,
      zBetaPower80: NORMAL_Z_POWER_080,
      planningWithinUtcDayIcc: M16_PLANNING_WITHIN_UTC_DAY_ICC,
      planningAvgTradesPerUtcDay: M16_PLANNING_AVG_TRADES_PER_UTC_DAY,
      note:
        "Design assumptions only — not estimated from M16 economic outcomes. "
        + "MDE=+5¢ is an economically meaningful detectability threshold after "
        + "~5¢ transaction friction; it is NOT a claim that +5¢ edge is expected. "
        + "IID N=155 achieves planning power only under independence; clustered "
        + "collection uses requiredTradeN=ceil(155·DE) with ρ=0.10.",
    },
    iidBaseline: {
      method: "ceil-((z_alpha+z_beta)*sd/mde)^2",
      iidBaselineTradeN,
      note: "IID baseline only — NOT the authoritative clustered collection N.",
    },
    dependencePlanIdentity: dependence.dependencePlanIdentity,
    primaryInferenceMethod: M16_CR2_INFERENCE_METHOD,
    collectionTargets: {
      iidBaselineTradeN,
      requiredTradeN,
      minimumUtcDayClusters: M16_MIN_UTC_DAY_CLUSTERS,
      jointRule: "tradeN-and-utcDayClusters-both-required",
      requiredTradeNDerivation: "ceil-iidBaseline-times-designEffect-rho-0.10",
    },
    decisionRules: {
      support:
        "All sealed collection requirements met AND sample mean > 0 AND "
        + "CR2 one-sided t-test with df=G−1 rejects H0: μ≤0 at α=0.05. "
        + "CR0+normal-z is forbidden.",
      failStopLineage:
        "Fixed prospective evidence budget completed (joint tradeN + UTC-day "
        + "clusters reached, or accepted-hour budget exhausted with joint "
        + "requirements already met) AND SUPPORT criterion not met → "
        + "validation-failed / stop-lineage. Positive mean alone, median, "
        + "target-hit share, subgroups, or exit retuning cannot rescue.",
      underpowered:
        "Accepted-hour budget exhausted before joint tradeN AND UTC-day "
        + "cluster requirements are met → validation-underpowered.",
      invalid:
        "Predeclared data-integrity / collection-protocol failures "
        + "(including fee-schedule change mid-collection, CR2 inapplicable "
        + "pathology, contamination).",
      nextActionIfSupported: "eligible-for-fresh-holdout",
      nextActionIfFailed: "stop-lineage",
      noRescueMetrics: [
        "median-pnl",
        "target-hit-rate",
        "stop-hit-rate",
        "yes-only-subgroup",
        "no-only-subgroup",
        "alternate-target-60",
        "alternate-reversal-detector",
        "parameter-retune",
        "daily-mean-aggregation-as-primary",
        "observed-icc-revision",
      ],
      diagnosticOnlyAfterOutcomeOpen: [
        "sample-mean-pnl",
        "cr2-one-sided-ci-or-test",
        "median-pnl",
        "p25-p75",
        "target-share",
        "structural-stop-share",
        "terminal-flatten-share",
        "average-winner",
        "average-loser",
        "time-in-trade",
        "candidate-side-yes-no-counts",
        "mean-pnl-per-eligible-utc-day-descriptive",
      ],
    },
  };

  const evidenceContractIdentity = createHash("sha256")
    .update(stableStringify(contract))
    .digest("hex");

  return { ...contract, evidenceContractIdentity };
}
