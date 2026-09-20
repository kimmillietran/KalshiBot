import { createHash } from "node:crypto";

import { RESPONSE_MATCH_TOLERANCE_MS } from "@/lib/data/research/kalshiTobMomentumFamily";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  bindM15FeeContract,
  M15_DECISION_HOSTILE_MIN_CENTS,
  M15_DECISION_HORIZON_MS,
  M15_DECISION_PLAUSIBLE_MAX_CENTS,
  M15_DISCLAIMER,
  M15_HISTORICAL_EFFECT_SCALE_CENTS,
  M15_HORIZONS_MS,
  M15_HURDLE_SHARE_BINS_CENTS,
  M15_PROPOSED_FRESH_CAPTURE_DURATION_MINUTES,
  M15_SAMPLE_CADENCE_MS,
  M15_STUDY_ANALYSIS_VERSION,
  M15_STUDY_NAME,
  M15_TARGET_INDEPENDENT_MARKET_DAYS,
} from "./m15CostFloorTypes";

export type M15StudyDefinition = {
  analysisVersion: typeof M15_STUDY_ANALYSIS_VERSION;
  studyId: typeof M15_STUDY_NAME;
  disclaimer: typeof M15_DISCLAIMER;
  purpose: string;
  feeContract: ReturnType<typeof bindM15FeeContract>;
  priceRepresentation: "legacy-no-leg";
  canonicalRoundTrip: "yes-taker-complement-symmetric-to-no";
  horizonsMs: typeof M15_HORIZONS_MS;
  sampleCadenceMs: typeof M15_SAMPLE_CADENCE_MS;
  responseMatchToleranceMs: typeof RESPONSE_MATCH_TOLERANCE_MS;
  independentUnit: "marketTicker-x-utc-calendar-day";
  primaryEstimand: string;
  secondaryEstimands: readonly string[];
  descriptiveShareBinsCents: typeof M15_HURDLE_SHARE_BINS_CENTS;
  historicalEffectScaleCents: typeof M15_HISTORICAL_EFFECT_SCALE_CENTS;
  decisionFramework: {
    decisionHorizonMs: typeof M15_DECISION_HORIZON_MS;
    plausibleMaxInclusiveCents: typeof M15_DECISION_PLAUSIBLE_MAX_CENTS;
    hostileMinExclusiveFloorCents: typeof M15_DECISION_HOSTILE_MIN_CENTS;
    note: string;
  };
  precisionTarget: {
    targetIndependentMarketDays: typeof M15_TARGET_INDEPENDENT_MARKET_DAYS;
    proposedFreshCaptureDurationMinutes: typeof M15_PROPOSED_FRESH_CAPTURE_DURATION_MINUTES;
    rationale: string;
  };
  captureRoleRequirements: readonly string[];
  contaminationExclusions: readonly string[];
  orderingSemantics: "jsonl-file-append-order-pr94";
  studyDefinitionIdentity: string;
};

export function buildM15StudyDefinition(): M15StudyDefinition {
  const feeContract = bindM15FeeContract();
  const definition: Omit<M15StudyDefinition, "studyDefinitionIdentity"> = {
    analysisVersion: M15_STUDY_ANALYSIS_VERSION,
    studyId: M15_STUDY_NAME,
    disclaimer: M15_DISCLAIMER,
    purpose:
      "Characterize ordinary KXBTC15M short-horizon taker round-trip economic "
      + "hurdle (spread + bound one-contract Kalshi fees) without predictive "
      + "signal analysis.",
    feeContract,
    priceRepresentation: "legacy-no-leg",
    canonicalRoundTrip: "yes-taker-complement-symmetric-to-no",
    horizonsMs: M15_HORIZONS_MS,
    sampleCadenceMs: M15_SAMPLE_CADENCE_MS,
    responseMatchToleranceMs: RESPONSE_MATCH_TOLERANCE_MS,
    independentUnit: "marketTicker-x-utc-calendar-day",
    primaryEstimand:
      "median-across-market-days-of-median-within-day-fee-inclusive-yes-taker-round-trip-hurdle-cents",
    secondaryEstimands: [
      "spread-only-round-trip-hurdle",
      "fee-contribution",
      "p25-p75-fee-inclusive",
      "share-market-days-median-fee-inclusive-at-most-1-2-3-cents",
    ],
    descriptiveShareBinsCents: M15_HURDLE_SHARE_BINS_CENTS,
    historicalEffectScaleCents: M15_HISTORICAL_EFFECT_SCALE_CENTS,
    decisionFramework: {
      decisionHorizonMs: M15_DECISION_HORIZON_MS,
      plausibleMaxInclusiveCents: M15_DECISION_PLAUSIBLE_MAX_CENTS,
      hostileMinExclusiveFloorCents: M15_DECISION_HOSTILE_MIN_CENTS,
      note:
        "Low hurdle does not prove a signal exists. High hurdle is strong reason "
        + "to stop tiny short-horizon taker signal research.",
    },
    precisionTarget: {
      targetIndependentMarketDays: M15_TARGET_INDEPENDENT_MARKET_DAYS,
      proposedFreshCaptureDurationMinutes: M15_PROPOSED_FRESH_CAPTURE_DURATION_MINUTES,
      rationale:
        "Descriptive median/quantile characterization across ≥24 independent "
        + "market-day units; one 8h KXBTC15M capture typically supplies many "
        + "distinct 15m markets. Avoid fake precision from raw quote counts.",
    },
    captureRoleRequirements: [
      "fresh-post-definition-seal-or-explicitly-untouched-non-m14-validation",
      "explicit-content-addressed-capture-descriptors",
      "no-mutable-latest",
    ],
    contaminationExclusions: [
      "m14-validation-events",
      "m14-validation-captures-segments-1-5-7",
      "m14-failed-segment-6",
      "m14-subgroup-slices",
      "holdout",
      "signed-future-returns",
      "momentum-event-conditioning",
    ],
    orderingSemantics: "jsonl-file-append-order-pr94",
  };

  const studyDefinitionIdentity = createHash("sha256")
    .update(stableStringify(definition))
    .digest("hex");

  return { ...definition, studyDefinitionIdentity };
}
