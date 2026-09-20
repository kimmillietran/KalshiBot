/**
 * M15 — KXBTC15M short-horizon taker cost-floor study v1 (prospective).
 *
 * MARKET-ECONOMICS feasibility only. No momentum / signal / M14-event conditioning.
 */
import { createHash } from "node:crypto";

import {
  KALSHI_FEE_MULTIPLIER_BY_VARIANT,
  KALSHI_FEE_SCHEDULE_ROLE,
  KALSHI_FEE_SCHEDULE_VARIANT,
} from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";
import { RESPONSE_MATCH_TOLERANCE_MS } from "@/lib/data/research/kalshiTobMomentumFamily";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export const M15_STUDY_NAME = "kalshi-kxbtc15m-taker-cost-floor-v1" as const;
export const M15_STUDY_ANALYSIS_VERSION = "m15.0-taker-cost-floor-v1" as const;

export const M15_DISCLAIMER =
  "M15 measures ordinary KXBTC15M short-horizon taker execution cost floors "
  + "(spread + bound one-contract Kalshi fees). It does not estimate predictive "
  + "alpha, momentum, reversal, or signal-conditioned P&L. A low cost floor does "
  + "not prove a signal exists; a high cost floor is a strong reason to stop "
  + "pursuing tiny short-horizon taker signals. M14 remains CLOSED "
  + "(validation-failed / stop-lineage); M15 must not consume M14 validation events.";

/** Short horizons for cost descriptors — not strategy candidates. */
export const M15_HORIZONS_MS = [5_000, 15_000, 30_000] as const;
export type M15HorizonMs = (typeof M15_HORIZONS_MS)[number];

/** Fixed cadence for ordinary-quote sampling (ms). Not outcome-dependent. */
export const M15_SAMPLE_CADENCE_MS = 60_000 as const;

/** Response match tolerance — align with family RESPONSE_MATCH_TOLERANCE_MS. */
export const M15_RESPONSE_MATCH_TOLERANCE_MS = RESPONSE_MATCH_TOLERANCE_MS;

/** Historical research effect scale (cents) — feasibility reference only. */
export const M15_HISTORICAL_EFFECT_SCALE_CENTS = 2 as const;

/** Prospective descriptive share bins (cents); frozen before evidence. */
export const M15_HURDLE_SHARE_BINS_CENTS = [1, 2, 3] as const;

/**
 * Primary decision horizon: 30s fee-inclusive median across market-days.
 * Thresholds vs historical 2¢ effect scale (prospective).
 */
export const M15_DECISION_HORIZON_MS = 30_000 as const;
export const M15_DECISION_PLAUSIBLE_MAX_CENTS = 1 as const;
export const M15_DECISION_HOSTILE_MIN_CENTS = 2 as const;

/**
 * Target ≥ this many independent market-day units for descriptive precision.
 * One 8h KXBTC15M capture typically yields many distinct 15m markets.
 */
export const M15_TARGET_INDEPENDENT_MARKET_DAYS = 24 as const;
export const M15_PROPOSED_FRESH_CAPTURE_DURATION_MINUTES = 480 as const;

/** Known M14 validation-role physical run IDs — hard-fail if supplied to M15. */
export const M15_FORBIDDEN_M14_VALIDATION_RUN_IDS = [
  "2026-09-13T04-05-01-822Z",
  "2026-09-13T09-38-54-911Z",
  "2026-09-14T07-33-30-421Z",
  "2026-09-18T07-59-28-489Z",
  "2026-09-18T16-25-35-978Z",
  "2026-09-19T07-49-12-459Z",
] as const;

export const M15_FORBIDDEN_M14_EXCLUDED_RUN_ID = "2026-09-19T00-54-42-279Z" as const;

export type M15ProgramDecision =
  | "short-horizon-taker-research-economically-plausible"
  | "short-horizon-taker-research-cost-constrained"
  | "short-horizon-taker-research-economically-hostile"
  | "insufficient-observability";

export type M15FeeContractBinding = {
  studyId: typeof M15_STUDY_NAME;
  feeContractStatus: "bound-standard-taker-for-m15-cost-floor";
  modulePath: "src/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents.ts";
  functionName: "computeKalshiScheduleFeeCents";
  role: typeof KALSHI_FEE_SCHEDULE_ROLE.TAKER;
  schedule: typeof KALSHI_FEE_SCHEDULE_VARIANT.STANDARD;
  quantityContracts: 1;
  feeContractIdentity: string;
  rounding: "ceil-to-next-cent";
  priceDependence: "quadratic-P*(100-P)";
  inventedFlatFeeForbidden: true;
  silentZeroFeeForbidden: true;
  /** Momentum family remains unbound; this bind is M15-study-scoped only. */
  doesNotBindMomentumFamilyNetEdge: true;
};

export function computeM15FeeContractIdentity(): string {
  return createHash("sha256")
    .update(
      stableStringify({
        studyId: M15_STUDY_NAME,
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

export function bindM15FeeContract(): M15FeeContractBinding {
  return {
    studyId: M15_STUDY_NAME,
    feeContractStatus: "bound-standard-taker-for-m15-cost-floor",
    modulePath: "src/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents.ts",
    functionName: "computeKalshiScheduleFeeCents",
    role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
    schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
    quantityContracts: 1,
    feeContractIdentity: computeM15FeeContractIdentity(),
    rounding: "ceil-to-next-cent",
    priceDependence: "quadratic-P*(100-P)",
    inventedFlatFeeForbidden: true,
    silentZeroFeeForbidden: true,
    doesNotBindMomentumFamilyNetEdge: true,
  };
}

export class M15CostFloorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "M15CostFloorError";
  }
}

export type M15CaptureDescriptor = {
  runId: string;
  captureRunDir: string;
  captureIdentityHash: string;
  /** Explicit research role; must not be M14 validation. */
  researchRole: "m15-cost-floor" | "untouched-candidate" | "other";
  /**
   * If present and equal to `validation`, fail closed (M14 contamination).
   * Fresh M15 captures omit this or set a non-validation label.
   */
  priorResearchRole?: string | null;
};

export type M15QuoteSampleHurdle = {
  marketTicker: string;
  tradingDayUtc: string;
  horizonMs: M15HorizonMs;
  entryTimestampMs: number;
  exitTimestampMs: number;
  spreadOnlyHurdleCents: number;
  entryFeeCents: number;
  exitFeeCents: number;
  totalFeeCents: number;
  feeInclusiveHurdleCents: number;
};

export type M15MarketDayHorizonSummary = {
  marketTicker: string;
  tradingDayUtc: string;
  horizonMs: M15HorizonMs;
  unitKey: string;
  samplePairCount: number;
  medianSpreadOnlyCents: number | null;
  medianFeeInclusiveCents: number | null;
  p25FeeInclusiveCents: number | null;
  p75FeeInclusiveCents: number | null;
};

export type M15HorizonAggregate = {
  horizonMs: M15HorizonMs;
  independentMarketDayN: number;
  rawSamplePairCount: number;
  medianFeeInclusiveCents: number | null;
  medianSpreadOnlyCents: number | null;
  medianFeeContributionCents: number | null;
  p25FeeInclusiveCents: number | null;
  p75FeeInclusiveCents: number | null;
  shareMarketDaysMedianFeeInclusiveAtMost: Record<"1" | "2" | "3", number | null>;
};

export type M15CostFloorReport = {
  analysisVersion: typeof M15_STUDY_ANALYSIS_VERSION;
  studyId: typeof M15_STUDY_NAME;
  disclaimer: typeof M15_DISCLAIMER;
  studyDefinitionIdentity: string;
  feeContract: M15FeeContractBinding;
  codeAuthoritySha: string | null;
  generatedAt: string;
  acceptedCaptureRunIds: readonly string[];
  acceptedCaptureIdentityHashes: readonly string[];
  horizonsMs: readonly M15HorizonMs[];
  sampleCadenceMs: typeof M15_SAMPLE_CADENCE_MS;
  independentUnit: "marketTicker-x-utc-calendar-day";
  canonicalRoundTrip: "yes-taker-complement-symmetric-to-no";
  historicalEffectScaleCents: typeof M15_HISTORICAL_EFFECT_SCALE_CENTS;
  decisionHorizonMs: typeof M15_DECISION_HORIZON_MS;
  programDecision: M15ProgramDecision;
  programDecisionRationale: string;
  perHorizon: readonly M15HorizonAggregate[];
  observability: {
    rawSampleAttempts: number;
    observablePairs: number;
    unobservableMissingResponse: number;
    unobservableInvalidBooks: number;
  };
  m14Contamination: {
    m14ValidationEventsConsumed: false;
    m14ValidationCapturesRejected: true;
    m14Closed: true;
    m14Status: "validation-failed";
    m14NextAction: "stop-lineage";
  };
  quarantine: {
    holdoutAccessed: false;
    liveOrders: false;
    signalAnalysisPerformed: false;
    momentumEventConditioning: false;
  };
  reportIdentity: string;
};
