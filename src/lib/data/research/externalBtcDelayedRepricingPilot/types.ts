/**
 * External BTC → delayed Kalshi KXBTC15M repricing pilot types.
 * Preparation-only: no purchases, no live trading, exploratory SPENT days only.
 */

export const EXTERNAL_BTC_DELAYED_REPRICING_PILOT_STUDY_ID =
  "kalshi-kxbtc15m-external-btc-delayed-repricing-pilot-v0" as const;

export const EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION =
  "2026-09-26-prep-v0" as const;

export const EXTERNAL_BTC_DELAYED_REPRICING_PILOT_DISCLAIMER =
  "Offline preparation + fixture-verified pilot runner only. "
  + "Does not purchase CryptoStruct data, spend credits, place orders, or claim "
  + "independent confirmation. All M16-ER pilot days remain exploratory SPENT. "
  + "M12.8 Coinbase→Kalshi lead-lag already classified no-directional-response on "
  + "KalshiBot live-capture TOB; this pilot tests a different data plane "
  + "(CryptoStruct tick books + explicit delay scenarios) and does not reopen M14/M16.";

export const PILOT_DELAY_MS = {
  PRIMARY: 1_000,
  SENSITIVITY: [250, 1_000, 3_000] as const,
} as const;

export type PilotDelayMs = (typeof PILOT_DELAY_MS.SENSITIVITY)[number];

export type TimestampSource =
  | "exchange"
  | "adapter"
  | "unavailable";

export type ExclusionReason =
  | "stale-book"
  | "chain-break"
  | "insufficient-displayed-size"
  | "missing-quote"
  | "overlapping-position"
  | "cooldown"
  | "no-active-contract"
  | "timing-quality-block"
  | "future-leakage-guard";

export type ExternalBtcEvent = {
  eventId: string;
  utcDay: string;
  eventTimestampMs: number;
  timestampSource: TimestampSource;
  direction: "up" | "down";
  returnBps: number;
  absoluteReturnBps: number;
  lookbackMs: number;
  btcPriceUsd: number;
  controlKind: "primary" | "sign-flip" | "time-sham";
};

export type ExecutableQuote = {
  timestampMs: number;
  timestampSource: TimestampSource;
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
};

export type SimulatedTrade = {
  eventId: string;
  utcDay: string;
  delayMs: PilotDelayMs;
  controlKind: ExternalBtcEvent["controlKind"];
  side: "YES" | "NO";
  entryTimestampMs: number;
  exitTimestampMs: number;
  entryPriceCents: number;
  exitPriceCents: number;
  entryFeeCents: number;
  exitFeeCents: number;
  grossPnlCents: number;
  netPnlCents: number;
  excluded: boolean;
  exclusionReason: ExclusionReason | null;
};

export type DaySummary = {
  utcDay: string;
  eventCount: number;
  tradeCount: number;
  excludedCount: number;
  meanNetPnlCents: number | null;
};

export type PilotUncertainty = {
  method: "cr2-cluster-robust-day-mean-two-sided-95ci";
  n: number;
  g: number;
  degreesOfFreedom: number | null;
  meanNetPnlCents: number | null;
  cr2StandardError: number | null;
  ciLowCents: number | null;
  ciHighCents: number | null;
};

export type PilotRunReport = {
  studyId: typeof EXTERNAL_BTC_DELAYED_REPRICING_PILOT_STUDY_ID;
  analysisVersion: typeof EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION;
  disclaimer: typeof EXTERNAL_BTC_DELAYED_REPRICING_PILOT_DISCLAIMER;
  parameters: Record<string, unknown>;
  inputHashes: Record<string, string>;
  events: ExternalBtcEvent[];
  trades: SimulatedTrade[];
  daySummaries: DaySummary[];
  byDelay: Record<
    string,
    {
      opportunityCount: number;
      excludedCount: number;
      uncertainty: PilotUncertainty;
    }
  >;
  timingExclusions: Array<{ eventId: string; reason: ExclusionReason }>;
  priorResearchNote: string;
};
