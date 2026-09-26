/**
 * Frozen primary pilot specification (no profit optimization).
 *
 * Threshold/lookback are frozen from the M12.8 lead-lag discovery cell
 * (5 bps boundary over a short horizon), not re-fit on pilot Kalshi P&L.
 * Delays are scenario assumptions, not measured production latency.
 */

import {
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_DISCLAIMER,
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_STUDY_ID,
  PILOT_DELAY_MS,
} from "./types";

/** Deterministic coverage-based day pick: every 7th M16-ER day by chronological index. */
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
  disclaimer: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_DISCLAIMER,
  hypothesis:
    "After an external Coinbase BTC-USD move, Kalshi KXBTC15M executable quotes "
    + "may adjust slowly enough that a delayed taker entry remains profitable "
    + "after STANDARD fees and a fixed short hold.",
  priorResearchAlreadyAnswered: {
    study: "btcKalshiLeadLagAnalysis / M12.8 TRAIN",
    artifactHint:
      "train-selected-run-lead-lag-analysis.json (KalshiBot live-capture Coinbase spot → Kalshi TOB)",
    interpretationClassification: "no-directional-response",
    recommendedNextAction: "deprioritize-btc-lead-lag-family",
    note:
      "A statistical lead on the live-capture plane does not authorize a tradable edge. "
      + "This pilot is allowed only as a different data-plane / delay-scenario check "
      + "on CryptoStruct tick books; it is not a revival of M14 momentum or M16 reversal.",
  },
  externalVenue: {
    venueCode: "coinbase",
    venueName: "Coinbase",
    instrumentCode: "BTC-USD",
    instrumentId: 15050,
    rationale:
      "Preferred by prompt when matched trade/BBO coverage exists. Catalog: 997 days, "
      + "covers all 34 M16-ER days, trades + L2 book + BBO stream. Binance Spot BTCUSD "
      + "is ~200× smaller/day but was not chosen: Coinbase is the stated preference and "
      + "has adequate coverage for the overlapping M16-ER window.",
  },
  kalshiSeries: {
    seriesKey: "kalshi-btc-15m",
    bundleId: 9000000001,
    messageTypesRequired: [0, 1, 2] as const,
    note: "Use raw book/trade updates from retained M16-ER ZIPs — not the 60s friction grid.",
  },
  daySelection: {
    rule: "every-7th-m16-er-day-chronological-index-0-based",
    universe: "34 SPENT M16-ER days with local RAW ZIPs",
    selectedUtcDays: PILOT_UTC_DAYS,
    selectionIsOutcomeBlind: true,
  },
  eventDefinition: {
    series: "Coinbase BTC-USD mid from reconstructed BBO (fallback: last trade)",
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
      "Among KXBTC15M contracts whose [start,expiry) contains eventTimestampMs, "
      + "pick the one with YES mid closest to 50¢ (ATM); ties → earlier expiry",
  },
  timing: {
    eventClock: "exchangeTimestamp when non-zero; else adapterTimestamp with timestampSource=adapter",
    joinClock: "same policy on both legs; causal as-of only (last observation ≤ decision time)",
    primaryDelayMs: PILOT_DELAY_MS.PRIMARY,
    sensitivityDelayMs: [...PILOT_DELAY_MS.SENSITIVITY],
    delaySemantics:
      "Scenario assumptions for when a bot would act after observing the external event — "
      + "not measured production latency",
    subsecondClaimPolicy:
      "Do not claim a subsecond opportunity if timing quality cannot support it; "
      + "250 ms remains a reported sensitivity, not a claim of synchronized clocks",
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
  positionPolicy: {
    cooldownMs: 60_000,
    overlappingPositions: "exclude-new-while-open",
    eventDedup: "one primary event per boundary-cross per lookback stream; cooldown applies",
  },
  controls: {
    signFlip: "trade opposite side of primary direction (diagnostic)",
    timeSham:
      "for each primary event, place a sham event at eventTimestamp − 2×hold − delay "
      + "with same magnitude metadata but no directional claim (diagnostic)",
    note: "Controls are diagnostic only — not additional strategy searches.",
  },
  primaryMetric: {
    name: "mean net P&L ¢/contract at primary delay",
    uncertainty: "CR2 cluster-robust SE by UTC day; two-sided 95% Student-t CI, df=G−1",
    unit: "cents",
  },
  stopExpandCriteria: {
    stopIf:
      "primary-delay mean ≤ 0, or CI entirely ≤ 0, or timing quality blocks ≤1s claims and "
      + "1s/3s means are nonpositive",
    expandOnlyIf:
      "primary-delay mean > 0 with CI entirely > 0 on exploratory SPENT — still requires a "
      + "separate preregistered fresh-period design before any confirmation claim",
    neverAuthorize: [
      "M14 Kalshi-only momentum revival",
      "M16 reversal revival",
      "further band/vol/side searches from #134/#136",
      "M17 settlement-state unpause",
      "live trading",
    ],
  },
  spentStatus: "all-pilot-days-exploratory-SPENT",
} as const;

export type FrozenPilotSpec = typeof FROZEN_PILOT_SPEC;
