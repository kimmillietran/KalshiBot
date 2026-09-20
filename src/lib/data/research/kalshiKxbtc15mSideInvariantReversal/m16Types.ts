/**
 * M16 — KXBTC15M side-invariant exhaustion-reversal family v1 (prospective).
 *
 * MARKET STRUCTURE / FEASIBILITY lineage. Not momentum continuation (M14).
 * Not a cost-floor study (M15). P&L / target-hit / stop-hit remain CLOSED
 * until a later governed outcome-open milestone.
 */
import { createHash } from "node:crypto";

import {
  KALSHI_FEE_MULTIPLIER_BY_VARIANT,
  KALSHI_FEE_SCHEDULE_ROLE,
  KALSHI_FEE_SCHEDULE_VARIANT,
} from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export const M16_FAMILY_ID = "reversal" as const;
export const M16_SUBFAMILY_ID =
  "kalshi-kxbtc15m-side-invariant-exhaustion-reversal-v1" as const;
export const M16_FAMILY_DEFINITION_VERSION =
  "kalshi-kxbtc15m-side-invariant-exhaustion-reversal-definition-v1" as const;
export const M16_INCIDENCE_PLAN_VERSION =
  "kalshi-kxbtc15m-side-invariant-exhaustion-reversal-incidence-plan-v1" as const;
export const M16_ANALYSIS_VERSION = "m16.0-side-invariant-reversal-v1" as const;

export const M16_DISCLAIMER =
  "M16 tests a mechanical complement-midpoint PROXY for a historical "
  + "side-invariant exhaustion-reversal idea. It does NOT reproduce Kalshi UI "
  + "last-price perception, discretionary BTC context, or subjective judgment. "
  + "Setup region 30–40 is NOT an entry trigger; entry requires the frozen "
  + "causal confirmation state machine. M13/M14/M15 remain closed lineages; "
  + "M16 must not rescue them. Incidence mode MUST NOT emit P&L, target-hit, "
  + "stop-hit, settlement direction, or signed returns.";

/** Setup down-cross threshold (cents). Frozen. */
export const M16_SETUP_CROSS_CENTS = 40 as const;
/** Abort if running low breaches this before confirmation. Frozen. */
export const M16_SETUP_ABORT_LOW_CENTS = 30 as const;
/** Off-low / pullback structural noise threshold (cents). Frozen. */
export const M16_STRUCTURE_TICK_CENTS = 1 as const;
/** Remaining-time gate at confirmation (ms). Frozen operational gate. */
export const M16_MIN_REMAINING_MS_AT_CONFIRMATION = 60_000 as const;
/** Eventual upside target (executable bid cents). Frozen — do not search. */
export const M16_TARGET_BID_CENTS = 55 as const;

/** Historical research effect scale from M15 (¢) — planning context only. */
export const M16_M15_COST_FLOOR_CONTEXT_CENTS = 5 as const;

/**
 * Prospective planning mean effects (¢) for sample-size sensitivity.
 * Theoretical only — not estimated from hidden outcomes.
 */
export const M16_PLANNING_MEAN_EFFECTS_CENTS = [3, 5, 10] as const;

/**
 * Conservative theoretical trade-level SD scenarios (¢) for planning.
 * Not estimated from census economic outcomes.
 */
export const M16_PLANNING_SD_SCENARIOS_CENTS = [15, 25, 40] as const;

/** Primary planning target mean effect (¢) before outcome-open. */
export const M16_PRIMARY_PLANNING_MEAN_EFFECT_CENTS = 5 as const;
/** Primary planning SD scenario (¢). */
export const M16_PRIMARY_PLANNING_SD_CENTS = 25 as const;
/**
 * Approximate target independent trade N for detecting primary planning
 * mean under primary SD (rough z≈1.96 two-sided precision heuristic:
 * n ≈ (1.96 * sd / mean)^2). Frozen prospectively.
 */
export const M16_TARGET_INDEPENDENT_TRADE_N = 96 as const;

/**
 * Maximum future capture budget (hours) before incidence-infeasible.
 * Frozen before census results; not M14's 40h by default.
 */
export const M16_MAX_FUTURE_CAPTURE_BUDGET_HOURS = 60 as const;

/** Cluster unit for uncertainty planning. */
export const M16_CLUSTER_UNIT = "capture-session" as const;

export const M16_FORBIDDEN_M14_VALIDATION_RUN_IDS = [
  "2026-09-13T04-05-01-822Z",
  "2026-09-13T09-38-54-911Z",
  "2026-09-14T07-33-30-421Z",
  "2026-09-18T07-59-28-489Z",
  "2026-09-18T16-25-35-978Z",
  "2026-09-19T07-49-12-459Z",
] as const;

export const M16_FORBIDDEN_M14_EXCLUDED_RUN_ID = "2026-09-19T00-54-42-279Z" as const;
/** M15 cost-floor capture — not outcome-bearing / not M16 incidence by default. */
export const M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID = "2026-09-20T02-52-53-859Z" as const;

export type M16CandidateSide = "YES" | "NO";

export type M16FeeContractStatus =
  | "bound-standard-taker-for-m16"
  | "fee-contract-unresolved-for-outcome-open";

export type M16FeeContractBinding = {
  studyId: typeof M16_SUBFAMILY_ID;
  feeContractStatus: M16FeeContractStatus;
  modulePath: "src/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents.ts";
  functionName: "computeKalshiScheduleFeeCents";
  role: typeof KALSHI_FEE_SCHEDULE_ROLE.TAKER;
  schedule: typeof KALSHI_FEE_SCHEDULE_VARIANT.STANDARD;
  quantityContracts: 1;
  feeContractIdentity: string;
  rounding: "ceil-to-next-cent";
  priceDependence: "quadratic-P*(100-P)";
  seriesScopeNote: string;
  profitabilityTestingBlockedUnlessBound: true;
  inventedFlatFeeForbidden: true;
  silentZeroFeeForbidden: true;
};

export function computeM16FeeContractIdentity(): string {
  return createHash("sha256")
    .update(
      stableStringify({
        studyId: M16_SUBFAMILY_ID,
        module: "src/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents.ts",
        function: "computeKalshiScheduleFeeCents",
        role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
        schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
        quantity: 1,
        multipliers: KALSHI_FEE_MULTIPLIER_BY_VARIANT,
        rounding: "ceil-to-next-cent",
      }),
    )
    .digest("hex");
}

export function bindM16FeeContract(): M16FeeContractBinding {
  return {
    studyId: M16_SUBFAMILY_ID,
    feeContractStatus: "bound-standard-taker-for-m16",
    modulePath: "src/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents.ts",
    functionName: "computeKalshiScheduleFeeCents",
    role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
    schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
    quantityContracts: 1,
    feeContractIdentity: computeM16FeeContractIdentity(),
    rounding: "ceil-to-next-cent",
    priceDependence: "quadratic-P*(100-P)",
    seriesScopeNote:
      "No in-repo KXBTC15M→reduced-index mapping exists; all prior KXBTC15M "
      + "research binds standard taker. Reduced-index remains available as a "
      + "config variant only. M16 binds standard; outcome-open must re-verify "
      + "against any future authoritative series fee schedule.",
    profitabilityTestingBlockedUnlessBound: true,
    inventedFlatFeeForbidden: true,
    silentZeroFeeForbidden: true,
  };
}

export class M16ReversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "M16ReversalError";
  }
}

export type M16CaptureDescriptor = {
  runId: string;
  captureRunDir: string;
  captureIdentityHash: string;
  researchRole: "m16-blind-incidence" | "untouched-candidate" | "other";
  priorResearchRole?: string | null;
};

/** Forbidden economic field name patterns for incidence outputs. */
export const M16_FORBIDDEN_INCIDENCE_FIELD_PATTERNS = [
  /pnlCents/i,
  /feeAdjustedPnl/i,
  /signedPnl/i,
  /signedGross/i,
  /signedReturn/i,
  /targetHit/i,
  /stopHit/i,
  /winner/i,
  /loser/i,
  /settlementDirection/i,
  /settlementResult/i,
  /entryAskCents/i,
  /exitBidCents/i,
  /favorableExcursion/i,
  /adverseExcursion/i,
  /returnSign/i,
] as const;

export type M16IncidenceFeasibility =
  | "incidence-feasible"
  | "incidence-infeasible"
  | "insufficient-census-observability";
