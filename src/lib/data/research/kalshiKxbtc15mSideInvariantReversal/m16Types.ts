/**
 * M16 — KXBTC15M side-invariant exhaustion-reversal family v1 (prospective).
 *
 * M16.0 scope: PROSPECTIVE FAMILY SEAL + P&L-BLIND INCIDENCE/COVERAGE ONLY.
 *
 * M16.1 (separate milestone, required before any economic outcome-open):
 * confirmatory evidence contract + dependence plan + authoritative KXBTC15M fee.
 *
 * MARKET STRUCTURE / FEASIBILITY lineage. Not momentum continuation (M14).
 * Not a cost-floor study (M15). P&L / target-hit / stop-hit remain CLOSED.
 */
import { createHash } from "node:crypto";

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
  + "stop-hit, settlement direction, or signed returns. M16.0 does NOT seal a "
  + "confirmatory sample size, dependence plan, or authoritative fee schedule; "
  + "economic outcome-open requires M16.1.";

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

/** Historical research effect scale from M15 (¢) — context only, not confirmatory. */
export const M16_M15_COST_FLOOR_CONTEXT_CENTS = 5 as const;

/**
 * M16.0 governance: confirmatory evidence contract is NOT sealed.
 * Do not treat any draft N / CI / power figure as authoritative.
 */
export const M16_CONFIRMATORY_EVIDENCE_CONTRACT_STATUS =
  "unsealed-for-outcome-open" as const;

/**
 * M16.0 governance: inferential dependence plan is NOT sealed.
 * Descriptive capture-session / UTC-day counts are coverage only.
 */
export const M16_DEPENDENCE_INFERENCE_PLAN_STATUS =
  "unsealed-for-outcome-open" as const;

/** M16.0: economic outcome-open is never authorized. */
export const M16_ECONOMIC_OUTCOME_OPEN_AUTHORIZED = false as const;

export const M16_OUTCOME_OPEN_BLOCKER_EVIDENCE_CONTRACT =
  "m16-confirmatory-evidence-contract-not-sealed" as const;
export const M16_OUTCOME_OPEN_BLOCKER_DEPENDENCE_PLAN =
  "m16-dependence-plan-not-sealed" as const;
export const M16_OUTCOME_OPEN_BLOCKER_FEE_UNRESOLVED =
  "authoritative-kxbtc15m-fee-schedule-not-bound" as const;
export const M16_OUTCOME_OPEN_BLOCKER_COHORT_UNSEALED =
  "m16-prospective-outcome-cohort-not-sealed" as const;

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

/**
 * Fee status for M16.0: unresolved for economic outcome-open.
 * Repository absence of a KXBTC15M→reduced-index map does NOT prove standard
 * taker applies. M16.1 must bind the schedule that actually applies.
 */
export type M16FeeContractStatus = "fee-contract-unresolved-for-outcome-open";

export type M16FeeContractBinding = {
  studyId: typeof M16_SUBFAMILY_ID;
  feeContractStatus: M16FeeContractStatus;
  feeContractIdentity: string;
  seriesScopeNote: string;
  authoritativeScheduleBound: false;
  provisionalStandardTakerUtilityOnly: true;
  profitabilityTestingBlockedUnlessBound: true;
  inventedFlatFeeForbidden: true;
  silentZeroFeeForbidden: true;
  outcomeOpenBlocker: typeof M16_OUTCOME_OPEN_BLOCKER_FEE_UNRESOLVED;
};

export function computeM16FeeContractIdentity(): string {
  return createHash("sha256")
    .update(
      stableStringify({
        studyId: M16_SUBFAMILY_ID,
        feeContractStatus: "fee-contract-unresolved-for-outcome-open",
        authoritativeScheduleBound: false,
        note:
          "No authoritative KXBTC15M series fee schedule is bound in M16.0. "
          + "Provisional standard-taker helpers are utility/test-only.",
      }),
    )
    .digest("hex");
}

export function bindM16FeeContract(): M16FeeContractBinding {
  return {
    studyId: M16_SUBFAMILY_ID,
    feeContractStatus: "fee-contract-unresolved-for-outcome-open",
    feeContractIdentity: computeM16FeeContractIdentity(),
    seriesScopeNote:
      "M16.0 does not claim standard or reduced-index as the actual KXBTC15M "
      + "schedule. Absence of an in-repo reduced-index map is not proof of "
      + "standard-taker. Economic outcome-open is blocked until M16.1 binds "
      + "authoritative series fee treatment from independent evidence.",
    authoritativeScheduleBound: false,
    provisionalStandardTakerUtilityOnly: true,
    profitabilityTestingBlockedUnlessBound: true,
    inventedFlatFeeForbidden: true,
    silentZeroFeeForbidden: true,
    outcomeOpenBlocker: M16_OUTCOME_OPEN_BLOCKER_FEE_UNRESOLVED,
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
  researchRole:
    | "m16-blind-incidence"
    | "m16-prospective-validation"
    | "untouched-candidate"
    | "other";
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

/**
 * Blind incidence disposition — descriptive coverage only.
 * Does NOT authorize confirmatory adequacy or profitability testing.
 */
export type M16IncidenceDisposition =
  | "incidence-characterized"
  | "insufficient-census-observability";

/** Conceptual scientific null (sealed). Decision procedure remains unsealed. */
export type M16ScientificEconomicNull =
  "mean-fee-adjusted-executable-pnl-leq-0-is-non-edge";

export type M16ConfirmatoryDecisionProcedureStatus =
  "UNSEALED-M16.1-REQUIRED-BEFORE-OUTCOME-OPEN";
