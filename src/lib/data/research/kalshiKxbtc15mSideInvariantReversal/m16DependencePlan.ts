/**
 * M16.1 dependence / clustering plan — sealed prospectively.
 * Uses structural incidence timing only; never inspects P&L.
 */
import { createHash } from "node:crypto";

import { computeRequiredSampleSize } from "@/lib/data/research/powerAnalysis/powerAnalysisMath";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { M16_SUBFAMILY_ID } from "./m16Types";

export const M16_DEPENDENCE_PLAN_VERSION =
  "kalshi-kxbtc15m-side-invariant-exhaustion-reversal-dependence-plan-v1" as const;

/**
 * Minimum distinct UTC calendar days with ≥1 eligible confirmation.
 * Aligns with M15's sealed independent market-day floor (24) for
 * asymptotic cluster-robust validity. Not estimated from M16 P&L.
 */
export const M16_MIN_UTC_DAY_CLUSTERS = 24 as const;

/**
 * Design-effect sensitivity (synthetic only): average cluster size ≈16
 * eligible entries per UTC day from blind incidence (~2.06/h × ~8h),
 * intra-cluster correlation scenarios ρ ∈ {0.1, 0.2, 0.3}.
 * Collection is NOT inflated to DE×155 (impractical); instead joint
 * (tradeN ≥ IID baseline ∧ utcDayClusters ≥ 24) + CRVE is sealed.
 */
export const M16_DEPENDENCE_SYNTHETIC_AVG_CLUSTER_SIZE = 16 as const;
export const M16_DEPENDENCE_SYNTHETIC_RHO_SCENARIOS = [0.1, 0.2, 0.3] as const;

export type M16DependencePlan = {
  planVersion: typeof M16_DEPENDENCE_PLAN_VERSION;
  subfamilyId: typeof M16_SUBFAMILY_ID;
  milestone: "m16.1-dependence-inference-plan";
  method:
    "utc-calendar-day-cluster-robust-variance-estimation-with-min-cluster-floor";
  chronologicalUnit: "utc-calendar-day-of-eligible-confirmation";
  clusterKey: "utcDayKey(confirmationTimestampMs)";
  tradeUnit: "first-time-gate-eligible-confirmation-per-marketTicker";
  minimumUtcDayClusters: typeof M16_MIN_UTC_DAY_CLUSTERS;
  inference:
    "one-sided-mean-test-with-utc-day-cluster-robust-standard-errors";
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
  }[];
  collectionBindingNote: string;
  dependencePlanIdentity: string;
};

export function designEffect(rho: number, avgClusterSize: number): number {
  return 1 + (avgClusterSize - 1) * rho;
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
      const de = designEffect(rho, M16_DEPENDENCE_SYNTHETIC_AVG_CLUSTER_SIZE);
      return {
        rho,
        avgClusterSize: M16_DEPENDENCE_SYNTHETIC_AVG_CLUSTER_SIZE,
        designEffect: de,
        // Informative only — not the sealed collection N
        iidBaselineInflatedN: Math.ceil(iidBaseline * de),
      };
    });

  const plan: Omit<M16DependencePlan, "dependencePlanIdentity"> = {
    planVersion: M16_DEPENDENCE_PLAN_VERSION,
    subfamilyId: M16_SUBFAMILY_ID,
    milestone: "m16.1-dependence-inference-plan",
    method:
      "utc-calendar-day-cluster-robust-variance-estimation-with-min-cluster-floor",
    chronologicalUnit: "utc-calendar-day-of-eligible-confirmation",
    clusterKey: "utcDayKey(confirmationTimestampMs)",
    tradeUnit: "first-time-gate-eligible-confirmation-per-marketTicker",
    minimumUtcDayClusters: M16_MIN_UTC_DAY_CLUSTERS,
    inference:
      "one-sided-mean-test-with-utc-day-cluster-robust-standard-errors",
    rationale:
      "Adjacent KXBTC15M markets share BTC regimes within a UTC day, so "
      + "IID trade-level SEs are not automatically defensible. Repo KXBTC15M "
      + "precedent (M14/M15/lead-lag) centers on UTC calendar day as the "
      + "dependence unit. M16 seals UTC-day clusters with CRVE and a minimum "
      + "of 24 distinct UTC days (M15 independent-day floor). Capture-session "
      + "alone is rejected as the sole inferential unit because 8h segments "
      + "can still pack many correlated markets; HAC/block-bootstrap lack "
      + "production inference implementations in-repo.",
    alternativesConsidered: [
      {
        method: "iid-trade-level-se-only",
        rejectedBecause:
          "Ignores shared BTC regime across markets within a day; census "
          + "showed 33 entries in only 2 sessions.",
      },
      {
        method: "capture-session-cluster-robust-only",
        rejectedBecause:
          "Too few sessions for asymptotic CRVE unless collection forces "
          + "many short sessions; UTC-day is the pre-existing scientific unit "
          + "across KXBTC15M research and is more stable than runId.",
      },
      {
        method: "hac-newey-west-fixed-lag",
        rejectedBecause:
          "No production HAC path in-repo; lag choice risk without P&L "
          + "peeking; UTC-day blocking is clearer for discrete 15m markets.",
      },
      {
        method: "block-bootstrap-primary",
        rejectedBecause:
          "Block bootstrap remains scaffold-only in oosPowerCorrection; "
          + "not a sealed primary confirmatory path.",
      },
      {
        method: "inflate-collection-n-by-max-design-effect",
        rejectedBecause:
          "ρ=0.3 × m̄=16 ⇒ DE≈5.5 ⇒ N≈850 / ~400h — operationally hostile "
          + "and still assumes unknown ρ. Prefer joint (tradeN∧dayClusters) "
          + "+ CRVE with explicit min cluster floor.",
      },
    ],
    syntheticDesignEffectSensitivity,
    collectionBindingNote:
      "Sealed collection requires jointly: tradeN ≥ IID baseline (155) AND "
      + "utcDayClusters ≥ 24. Design-effect rows are sensitivity documentation "
      + "only and do not authorize outcome-open by themselves.",
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
