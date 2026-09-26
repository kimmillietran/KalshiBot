/**
 * External BTC → delayed Kalshi KXBTC15M repricing pilot types.
 * Correction v1: runnable ingestion, evidence-based timing, entry/exit separation.
 */

export const EXTERNAL_BTC_DELAYED_REPRICING_PILOT_STUDY_ID =
  "kalshi-kxbtc15m-external-btc-delayed-repricing-pilot-v0" as const;

/** Spec/code version after PR #137 corrections (preserves prep-v0 semantics where unchanged). */
export const EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION =
  "2026-09-26-correction-v1" as const;

export const EXTERNAL_BTC_DELAYED_REPRICING_PILOT_PRIOR_ANALYSIS_VERSION =
  "2026-09-26-prep-v0" as const;

export const EXTERNAL_BTC_DELAYED_REPRICING_PILOT_DISCLAIMER =
  "Offline fixture-verified pilot runner. Does not purchase CryptoStruct data, spend "
  + "credits, place orders, or claim independent confirmation. All M16-ER pilot days "
  + "remain exploratory SPENT and Friday-only. M12.8 already classified live-capture "
  + "Coinbase→Kalshi TOB mid-response as no-directional-response; this pilot only "
  + "addresses fee-aware delayed-taker economics on CryptoStruct ticks under declared "
  + "scenario delays — not verified live tradability. Delay results are never auto-promoted.";

export const PILOT_DELAY_MS = {
  PRIMARY: 1_000,
  SENSITIVITY: [250, 1_000, 3_000] as const,
} as const;

export type PilotDelayMs = (typeof PILOT_DELAY_MS.SENSITIVITY)[number];

export type TimestampSource = "exchange" | "adapter" | "unavailable";

export type ClockDomain = "exchange" | "adapter";

export type DelayClaimStatus =
  | "diagnostic-only"
  | "scenario-assumption-unverified"
  | "blocked-domain-mix"
  | "blocked-missing-timestamps";

export type PreEntryRejectReason =
  | "stale-book"
  | "chain-break"
  | "insufficient-displayed-size"
  | "missing-quote"
  | "overlapping-position"
  | "cooldown"
  | "no-active-contract"
  | "insufficient-time-to-expiry"
  | "timing-quality-block"
  | "future-leakage-guard"
  | "timestamp-domain-mix";

export type ExitFailureReason =
  | "stale-book"
  | "chain-break"
  | "insufficient-displayed-size"
  | "missing-quote"
  | "expiry-before-exit"
  | "contract-mismatch";

export type EntryStatus = "rejected-pre-entry" | "entered";
export type ExitStatus = "not-applicable" | "completed" | "unresolved";

export type EconomicResultStatus =
  | "no-entries"
  | "complete"
  | "incomplete-unresolved-exits";

export type ExternalBtcEvent = {
  eventId: string;
  utcDay: string;
  /** Observation time in the declared decision clock domain. */
  eventTimestampMs: number;
  timestampSource: TimestampSource;
  clockDomain: ClockDomain;
  direction: "up" | "down";
  returnBps: number;
  absoluteReturnBps: number;
  lookbackMs: number;
  btcPriceUsd: number;
  controlKind: "primary" | "sign-flip" | "time-sham-retrospective-placebo";
  controlNote: string | null;
};

export type ExecutableQuote = {
  /** Join timestamp in the declared decision clock domain. */
  timestampMs: number;
  clockDomain: ClockDomain;
  timestampSource: TimestampSource;
  adapterTimestampMs: number;
  exchangeTimestampMs: number | null;
  yesBidCents: number;
  yesAskCents: number;
  yesBidSize: number;
  yesAskSize: number;
  noBidCents: number;
  noAskCents: number;
  noBidSize: number;
  noAskSize: number;
  stale: boolean;
  chainBreak: boolean;
  failClosed: boolean;
};

export type SelectedContract = {
  ticker: string;
  startMs: number;
  expiryMs: number;
};

export type SimulatedTrade = {
  eventId: string;
  utcDay: string;
  delayMs: PilotDelayMs;
  controlKind: ExternalBtcEvent["controlKind"];
  side: "YES" | "NO";
  contract: SelectedContract | null;
  entryStatus: EntryStatus;
  exitStatus: ExitStatus;
  entryTimestampMs: number;
  /** Intended exit decision time (hold end), even if unresolved. */
  intendedExitTimestampMs: number;
  exitTimestampMs: number | null;
  entryPriceCents: number | null;
  exitPriceCents: number | null;
  entryFeeCents: number;
  exitFeeCents: number;
  grossPnlCents: number | null;
  /** Completed-trade net only; null when rejected or unresolved. */
  completedNetPnlCents: number | null;
  /** Lower economic bound for entered positions (always set when entered). */
  allEntryLowerBoundNetCents: number | null;
  /** Upper economic bound for entered positions (always set when entered). */
  allEntryUpperBoundNetCents: number | null;
  preEntryRejectReason: PreEntryRejectReason | null;
  exitFailureReason: ExitFailureReason | null;
  /** @deprecated use entryStatus/exitStatus; true only for pre-entry rejects */
  excluded: boolean;
  exclusionReason: PreEntryRejectReason | null;
};

export type DaySummary = {
  utcDay: string;
  weekday: "Friday";
  primaryEventCount: number;
  preEntryRejectCount: number;
  enteredCount: number;
  completedExitCount: number;
  unresolvedExitCount: number;
  completedMeanNetPnlCents: number | null;
};

export type PilotUncertainty = {
  method: "cr2-cluster-robust-day-mean-two-sided-95ci-fragile-exploratory";
  label: "fragile-exploratory-G-le-5";
  n: number;
  g: number;
  degreesOfFreedom: number | null;
  meanNetPnlCents: number | null;
  cr2StandardError: number | null;
  ciLowCents: number | null;
  ciHighCents: number | null;
  note: string;
};

export type DelayEconomics = {
  opportunityEnteredCount: number;
  preEntryRejectCount: number;
  completedExitCount: number;
  unresolvedExitCount: number;
  economicResultStatus: EconomicResultStatus;
  completedTradeUncertainty: PilotUncertainty;
  allEntryLowerBoundMeanCents: number | null;
  allEntryUpperBoundMeanCents: number | null;
  delayClaimStatus: DelayClaimStatus;
  clockAlignmentStatus: "unknown";
  daily: DaySummary[];
};

export type PilotRunReport = {
  studyId: typeof EXTERNAL_BTC_DELAYED_REPRICING_PILOT_STUDY_ID;
  analysisVersion: typeof EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION;
  priorAnalysisVersion: typeof EXTERNAL_BTC_DELAYED_REPRICING_PILOT_PRIOR_ANALYSIS_VERSION;
  disclaimer: typeof EXTERNAL_BTC_DELAYED_REPRICING_PILOT_DISCLAIMER;
  parameters: Record<string, unknown>;
  inputHashes: Record<string, string>;
  codeVersions: Record<string, string>;
  events: ExternalBtcEvent[];
  trades: SimulatedTrade[];
  daySummaries: DaySummary[];
  byDelay: Record<string, DelayEconomics>;
  timingNotes: Array<{ eventId: string; delayMs: number; status: DelayClaimStatus }>;
  m128Reconciliation: Record<string, unknown>;
  fridayOnly: true;
};
