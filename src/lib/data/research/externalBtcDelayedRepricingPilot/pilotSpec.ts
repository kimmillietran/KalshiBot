/**
 * Frozen primary pilot specification (correction-v1).
 *
 * Threshold/lookback frozen from M12.8 5 bps cell — not fit on pilot P&L.
 * Delays are scenario assumptions, not measured production latency / verified tradability.
 * Prep-v0 preserved conceptually; corrections documented in `correctionsFromPrepV0`.
 */

import { M128_RECONCILIATION } from "./m128Reconciliation";
import { EXIT_FAILURE_POLICY } from "./simulateTrades";
import { CLOCK_POLICY } from "./timingQuality";
import {
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_DISCLAIMER,
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_PRIOR_ANALYSIS_VERSION,
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_STUDY_ID,
  PILOT_DELAY_MS,
} from "./types";

/** Every 7th M16-ER day — all Fridays; not representative weekday coverage. */
export const PILOT_UTC_DAYS = [
  "2026-08-14",
  "2026-08-21",
  "2026-08-28",
  "2026-09-04",
  "2026-09-11",
] as const;

export const FROZEN_PILOT_SPEC = {
  studyId: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_STUDY_ID,
  analysisVersion: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
  priorAnalysisVersion: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_PRIOR_ANALYSIS_VERSION,
  disclaimer: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_DISCLAIMER,
  correctionsFromPrepV0: [
    "Implemented streaming Coinbase/Kalshi ingestion and --run-real path (gated empirics)",
    "Removed invented 50–250ms cross-venue sync bound; delays never auto-verified",
    "Separated pre-entry reject vs entered+unresolved exit; exit-failure policy frozen",
    "Friday-only label; fragile G≤5 CI; control isolation + retrospective placebo labeling",
    "Concrete M12.8 reconciliation with material fee-aware delayed-taker gap",
  ],
  hypothesis:
    "After an external Coinbase BTC-USD move, Kalshi KXBTC15M executable quotes may "
    + "adjust slowly enough that a delayed taker entry remains profitable after STANDARD "
    + "fees and a fixed short hold — as a scenario study, not verified live tradability.",
  m128Reconciliation: M128_RECONCILIATION,
  priorResearchAlreadyAnswered: {
    study: "btcKalshiLeadLagAnalysis / M12.8 TRAIN",
    interpretationClassification: "no-directional-response",
    recommendedNextAction: "deprioritize-btc-lead-lag-family",
    answeredQuestion: M128_RECONCILIATION.m128QuestionAnswered,
    note: M128_RECONCILIATION.decision,
  },
  externalVenue: {
    venueCode: "coinbase",
    venueName: "Coinbase",
    instrumentCode: "BTC-USD",
    instrumentId: 15050,
    rationale:
      "Preferred when matched trade/BBO coverage exists. Catalog covers all 34 M16-ER days.",
  },
  kalshiSeries: {
    seriesKey: "kalshi-btc-15m",
    bundleId: 9000000001,
    messageTypesRequired: [0, 1, 2] as const,
    note: "Raw book/trade updates from retained M16-ER ZIPs — not the 60s friction grid.",
  },
  daySelection: {
    rule: "every-7th-m16-er-day-chronological-index-0-based",
    universe: "34 SPENT M16-ER days with local RAW ZIPs",
    selectedUtcDays: PILOT_UTC_DAYS,
    selectionIsOutcomeBlind: true,
    fridayOnly: true,
    weekdayCoverageClaim: "none — Friday-only exploratory sample; not representative weekdays",
  },
  eventDefinition: {
    series: "Coinbase BTC-USD mid from reconstructed BBO (change-sparsified)",
    lookbackMs: 5_000,
    boundaryBps: 5,
    trigger: "absolute lookback return crosses 5 bps from below (boundary cross)",
    direction: "sign of lookback return (up|down)",
    normalization: "basis points vs lookback start price",
    thresholdSource:
      "Frozen from M12.8 MAGNITUDE_BOUNDARIES_BPS lower cell (5 bps); not estimated on pilot P&L",
    calibrationSplit: null,
  },
  kalshiContractSelection: {
    rule:
      "At eventObservationTime: among KXBTC15M with start≤t<expiry and intended exit before "
      + "expiry, pick YES mid closest to 50¢; ties → earlier expiry. Same contract through exit.",
    insufficientTimeToExpiry: "pre-entry reject if event+delay+hold ≥ expiry",
  },
  timing: {
    clockPolicy: CLOCK_POLICY,
    primaryDelayMs: PILOT_DELAY_MS.PRIMARY,
    sensitivityDelayMs: [...PILOT_DELAY_MS.SENSITIVITY],
    delaySemantics:
      "Scenario assumptions for modeled decision time — not measured production latency "
      + "and not verified tradability. 250ms diagnostic-only; 1s/3s unverified scenarios.",
  },
  execution: {
    sizeContracts: 1,
    entry: "taker buy of directional side at ask after delay",
    exit: "taker sell at bid after fixed hold",
    holdMs: 15_000,
    feeSchedule: "STANDARD",
    feeRole: "taker",
    feeSides: "entry+exit",
    minDisplayedSize: 1,
    staleMaxAgeMs: 2_000,
  },
  exitFailurePolicy: EXIT_FAILURE_POLICY,
  positionPolicy: {
    cooldownMs: 60_000,
    overlappingPositions: "exclude-new-while-open-through-intended-exit",
    eventDedup: "boundary-cross cooldown on primary detection stream",
  },
  controls: {
    signFlip:
      "Outcome-sharing diagnostic (flipped side). Not independent evidence. Isolated state.",
    timeSham:
      "Retrospective placebo using a future event's direction at an earlier timestamp. "
      + "Not a deployable causal strategy. Isolated state.",
  },
  primaryMetric: {
    name: "completed-trade mean net P&L ¢/contract at primary delay (1s)",
    allEntryBounds: "report lower/upper means when unresolved exits exist",
    uncertainty:
      "Fragile exploratory CR2 day-cluster CI (G≤5 Friday-only) — not confirmation gate",
    incompletePolicy:
      "If any unresolved exits: economicResultStatus=incomplete-unresolved-exits; "
      + "do not claim profitability from completed trades alone",
  },
  stopExpandCriteria: {
    stopIf:
      "primary 1s all-entry bounds / completed economics nonpositive, or incomplete without "
      + "defensible bounds, or no material fee-aware edge beyond M12.8's negative mid finding",
    expandOnlyIf:
      "exploratory promise under complete accounting — still requires separate preregistered "
      + "fresh-period design; CI lower>0 alone insufficient",
    neverAuthorize: [
      "M14 Kalshi-only momentum revival",
      "M16 reversal revival",
      "further band/vol/side searches from #134/#136",
      "M17 settlement-state unpause",
      "live trading",
      "auto-promote 1s/3s to verified tradability",
    ],
  },
  spentStatus: "all-pilot-days-exploratory-SPENT-friday-only",
} as const;

export type FrozenPilotSpec = typeof FROZEN_PILOT_SPEC;
