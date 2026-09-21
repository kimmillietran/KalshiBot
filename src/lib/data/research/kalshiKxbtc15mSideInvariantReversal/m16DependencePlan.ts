/**
 * M16.1a dependence / clustering plan (v2) — supersedes M16.1 v1.
 * Prospective planning only; never inspects P&L.
 */
import { createHash } from "node:crypto";

import { computeRequiredSampleSize } from "@/lib/data/research/powerAnalysis/powerAnalysisMath";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { M16_CR2_INFERENCE_METHOD } from "./m16Cr2ClusterMean";
import {
  M16_1A_AMENDMENT_REASON,
  M16_1_PRIOR_DEPENDENCE_PLAN_IDENTITY,
} from "./m16PriorContractIdentities";
import { M16_SUBFAMILY_ID } from "./m16Types";

export const M16_DEPENDENCE_PLAN_VERSION =
  "kalshi-kxbtc15m-side-invariant-exhaustion-reversal-dependence-plan-v2" as const;

/** Prospective small-cluster diversity floor — NOT a CRVE theorem. */
export const M16_MIN_UTC_DAY_CLUSTERS = 24 as const;

/** Prospective planning ICC within UTC day — not estimated from M16 P&L. */
export const M16_PLANNING_WITHIN_UTC_DAY_ICC = 0.1 as const;

/**
 * Blind structural incidence (~2.06/h) × sealed 4h daily window.
 * Exact: M16_BLIND_INCIDENCE_RATE_PER_HOUR * 4.
 */
export const M16_PLANNING_AVG_TRADES_PER_UTC_DAY = 8.250135926718654 as const;

export const M16_DEPENDENCE_SYNTHETIC_RHO_SCENARIOS =
  [0, 0.05, 0.1, 0.2, 0.3] as const;

export type M16DependencePlan = {
  planVersion: typeof M16_DEPENDENCE_PLAN_VERSION;
  subfamilyId: typeof M16_SUBFAMILY_ID;
  milestone: "m16.1a-dependence-inference-plan";
  supersedesDependencePlanIdentity: typeof M16_1_PRIOR_DEPENDENCE_PLAN_IDENTITY;
  amendmentReason: typeof M16_1A_AMENDMENT_REASON;
  economicOutcomesOpenedBeforeAmendment: false;
  method: typeof M16_CR2_INFERENCE_METHOD;
  chronologicalUnit: "utc-calendar-day-of-eligible-confirmation";
  clusterKey: "utcDayKey(confirmationTimestampMs)";
  tradeUnit: "first-time-gate-eligible-confirmation-per-marketTicker";
  minimumUtcDayClusters: typeof M16_MIN_UTC_DAY_CLUSTERS;
  minimumUtcDayClustersJustification:
    "prospective-small-cluster-diversity-floor-not-crve-theorem";
  planningWithinUtcDayIcc: typeof M16_PLANNING_WITHIN_UTC_DAY_ICC;
  planningAvgTradesPerUtcDay: typeof M16_PLANNING_AVG_TRADES_PER_UTC_DAY;
  primaryInference: {
    varianceEstimator: "CR2";
    designMatrix: "intercept-only-column-of-ones";
    test: "one-sided-t";
    degreesOfFreedomRule: "G-minus-1";
    nullHypothesis: "mu-leq-0";
    alternativeHypothesis: "mu-gt-0";
    alpha: 0.05;
    forbidCr0PlusNormalZ: true;
    forbidSilentIidFallback: true;
  };
  rationale: string;
  alternativesConsidered: readonly {
    method: string;
    rejectedBecause: string;
  }[];
  syntheticDesignEffectSensitivity: readonly {
    rho: number;
    avgClusterSize: number;
    designEffect: number;
    iidBaselineInflatedN: number;
    role: "documentary-only" | "primary-planning";
  }[];
  collectionBindingNote: string;
  dependencePlanIdentity: string;
};

export function designEffect(rho: number, avgClusterSize: number): number {
  return 1 + (avgClusterSize - 1) * rho;
}

export function computeM16ClusteredPlanningTradeN(input?: {
  iidBaselineTradeN?: number;
  rho?: number;
  avgClusterSize?: number;
}): number {
  const iid =
    input?.iidBaselineTradeN
    ?? computeRequiredSampleSize({
      edgeCents: 5,
      standardDeviation: 25,
      alpha: 0.05,
      targetPower: 0.8,
    })
    ?? 155;
  const rho = input?.rho ?? M16_PLANNING_WITHIN_UTC_DAY_ICC;
  const m = input?.avgClusterSize ?? M16_PLANNING_AVG_TRADES_PER_UTC_DAY;
  return Math.ceil(iid * designEffect(rho, m));
}

export function buildM16DependencePlan(): M16DependencePlan {
  const iidBaseline =
    computeRequiredSampleSize({
      edgeCents: 5,
      standardDeviation: 25,
      alpha: 0.05,
      targetPower: 0.8,
    }) ?? 155;

  const syntheticDesignEffectSensitivity =
    M16_DEPENDENCE_SYNTHETIC_RHO_SCENARIOS.map((rho) => {
      const de = designEffect(rho, M16_PLANNING_AVG_TRADES_PER_UTC_DAY);
      return {
        rho,
        avgClusterSize: M16_PLANNING_AVG_TRADES_PER_UTC_DAY,
        designEffect: de,
        iidBaselineInflatedN: Math.ceil(iidBaseline * de),
        role:
          rho === M16_PLANNING_WITHIN_UTC_DAY_ICC
            ? ("primary-planning" as const)
            : ("documentary-only" as const),
      };
    });

  const plan: Omit<M16DependencePlan, "dependencePlanIdentity"> = {
    planVersion: M16_DEPENDENCE_PLAN_VERSION,
    subfamilyId: M16_SUBFAMILY_ID,
    milestone: "m16.1a-dependence-inference-plan",
    supersedesDependencePlanIdentity: M16_1_PRIOR_DEPENDENCE_PLAN_IDENTITY,
    amendmentReason: M16_1A_AMENDMENT_REASON,
    economicOutcomesOpenedBeforeAmendment: false,
    method: M16_CR2_INFERENCE_METHOD,
    chronologicalUnit: "utc-calendar-day-of-eligible-confirmation",
    clusterKey: "utcDayKey(confirmationTimestampMs)",
    tradeUnit: "first-time-gate-eligible-confirmation-per-marketTicker",
    minimumUtcDayClusters: M16_MIN_UTC_DAY_CLUSTERS,
    minimumUtcDayClustersJustification:
      "prospective-small-cluster-diversity-floor-not-crve-theorem",
    planningWithinUtcDayIcc: M16_PLANNING_WITHIN_UTC_DAY_ICC,
    planningAvgTradesPerUtcDay: M16_PLANNING_AVG_TRADES_PER_UTC_DAY,
    primaryInference: {
      varianceEstimator: "CR2",
      designMatrix: "intercept-only-column-of-ones",
      test: "one-sided-t",
      degreesOfFreedomRule: "G-minus-1",
      nullHypothesis: "mu-leq-0",
      alternativeHypothesis: "mu-gt-0",
      alpha: 0.05,
      forbidCr0PlusNormalZ: true,
      forbidSilentIidFallback: true,
    },
    rationale:
      "Adjacent KXBTC15M markets share BTC regimes within a UTC day. "
      + "M16.1a seals CR2 + one-sided t_(G−1) as the primary estimator, "
      + "prospective ICC=0.10 for collection inflation, and G≥24 as a "
      + "small-cluster diversity floor (not a CRVE theorem / not M15 proof). "
      + "CR0+z=1.645 with ~24 clusters is forbidden.",
    alternativesConsidered: [
      {
        method: "iid-trade-level-se-only",
        rejectedBecause: "Ignores within-day BTC regime dependence.",
      },
      {
        method: "generic-crve-without-cr2-specification",
        rejectedBecause:
          "M16.1 prose CRVE was too vague; small-G requires explicit CR2 + t_(G−1).",
      },
      {
        method: "cr0-plus-normal-z-1.645",
        rejectedBecause: "Anti-conservative with G≈24.",
      },
      {
        method: "inflate-n-using-8h-cluster-size-m16",
        rejectedBecause:
          "8h/day was operational packing, not an inferential requirement; "
          + "4h/day reduces within-day packing.",
      },
    ],
    syntheticDesignEffectSensitivity,
    collectionBindingNote:
      "Sealed collection requires jointly: tradeN ≥ ceil(155·DE(ρ=0.10,m≈8.25)) "
      + "AND utcDayClusters ≥ 24. Non-primary ρ rows are documentary only.",
  };

  const dependencePlanIdentity = createHash("sha256")
    .update(stableStringify(plan))
    .digest("hex");

  return { ...plan, dependencePlanIdentity };
}

/** Deterministic UTC day key from confirmation timestamp (ms). */
export function m16UtcDayKey(confirmationTimestampMs: number): string {
  return new Date(confirmationTimestampMs).toISOString().slice(0, 10);
}
