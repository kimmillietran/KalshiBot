/**
 * M16.1 confirmatory evidence contract — sealed prospectively.
 * Does NOT evaluate real P&L. Synthetic tests only for decision-rule plumbing.
 */
import { createHash } from "node:crypto";

import {
  computeRequiredSampleSize,
  NORMAL_Z_ONE_TAILED_ALPHA_005,
  NORMAL_Z_POWER_080,
} from "@/lib/data/research/powerAnalysis/powerAnalysisMath";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildM16DependencePlan } from "./m16DependencePlan";
import { M16_SUBFAMILY_ID } from "./m16Types";

export const M16_EVIDENCE_CONTRACT_VERSION =
  "kalshi-kxbtc15m-side-invariant-exhaustion-reversal-evidence-contract-v1" as const;

export const M16_EVIDENCE_ALPHA = 0.05 as const;
export const M16_EVIDENCE_TARGET_POWER = 0.8 as const;
export const M16_EVIDENCE_MDE_CENTS = 5 as const;
export const M16_EVIDENCE_PLANNING_SD_CENTS = 25 as const;
export const M16_EVIDENCE_SIDEDNESS = "one-sided" as const;

/** H0: μ ≤ 0 (non-edge). H1: μ > 0 (positive mean fee-adjusted expectancy). */
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
  milestone: "m16.1-confirmatory-evidence-contract";
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
    note: string;
  };
  iidBaseline: {
    method: "ceil-((z_alpha+z_beta)*sd/mde)^2";
    iidBaselineTradeN: number;
  };
  dependencePlanIdentity: string;
  collectionTargets: {
    requiredTradeN: number;
    minimumUtcDayClusters: number;
    jointRule: "tradeN-and-utcDayClusters-both-required";
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
  const contract: Omit<M16EvidenceContract, "evidenceContractIdentity"> = {
    contractVersion: M16_EVIDENCE_CONTRACT_VERSION,
    subfamilyId: M16_SUBFAMILY_ID,
    milestone: "m16.1-confirmatory-evidence-contract",
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
      note:
        "Design assumptions only — not estimated from M16 economic outcomes. "
        + "MDE=+5¢ is an economically meaningful detectability threshold after "
        + "~5¢ transaction friction; it is NOT a claim that +5¢ edge is expected.",
    },
    iidBaseline: {
      method: "ceil-((z_alpha+z_beta)*sd/mde)^2",
      iidBaselineTradeN,
    },
    dependencePlanIdentity: dependence.dependencePlanIdentity,
    collectionTargets: {
      requiredTradeN: iidBaselineTradeN,
      minimumUtcDayClusters: dependence.minimumUtcDayClusters,
      jointRule: "tradeN-and-utcDayClusters-both-required",
    },
    decisionRules: {
      support:
        "All sealed collection requirements met AND one-sided α=0.05 test "
        + "rejects H0: μ≤0 (equivalently one-sided 95% lower confidence bound "
        + "for μ > 0) AND observed sample mean > 0. Inference uses the sealed "
        + "UTC-day cluster-robust variance estimator.",
      failStopLineage:
        "Fixed prospective evidence budget completed (joint tradeN + UTC-day "
        + "clusters reached, or accepted-hour budget exhausted with joint "
        + "requirements met) AND SUPPORT criterion not met → validation-failed "
        + "/ stop-lineage. Positive mean alone, median, target-hit share, "
        + "subgroups, YES-only/NO-only, or exit retuning cannot rescue.",
      underpowered:
        "Accepted-hour budget exhausted before joint tradeN AND UTC-day "
        + "cluster requirements are met → validation-underpowered. Not a "
        + "license to reinterpret a completed non-significant result.",
      invalid:
        "Predeclared data-integrity / collection-protocol failures that prevent "
        + "reaching the sealed evidence requirement under the governed contract "
        + "(e.g. fee schedule change mid-collection requiring amendment, "
        + "contamination of the accepted registry).",
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
      ],
      diagnosticOnlyAfterOutcomeOpen: [
        "sample-mean-pnl",
        "one-sided-ci-or-test",
        "median-pnl",
        "p25-p75",
        "target-share",
        "structural-stop-share",
        "terminal-flatten-share",
        "average-winner",
        "average-loser",
        "time-in-trade",
        "candidate-side-yes-no-counts",
      ],
    },
  };

  const evidenceContractIdentity = createHash("sha256")
    .update(stableStringify(contract))
    .digest("hex");

  return { ...contract, evidenceContractIdentity };
}
