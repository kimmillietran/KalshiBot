export const ONE_CLOSE_CAMPAIGN_ID =
  "kalshi-kxbtc15m-one-close-settlement-fidelity-v0" as const;

export const ONE_CLOSE_STUDY_ID = ONE_CLOSE_CAMPAIGN_ID;

export const DEFAULT_ONE_CLOSE_OUT_DIR =
  "data/research-results/external-kalshi-data-audit/m17-prep-one-close-settlement-fidelity" as const;

export const DEFAULT_ONE_CLOSE_RAW_DIR =
  "data/research-results/external-kalshi-data-audit/m17-prep-one-close-settlement-fidelity/raw" as const;

/** Hard ceiling for this one-close task (discovery + metadata + all retries). */
export const ONE_CLOSE_MAX_HTTP = 12;

export const ONE_CLOSE_CONNECT_BEFORE_MS = 75_000;
export const ONE_CLOSE_CAPTURE_START_BEFORE_MS = 70_000;
export const ONE_CLOSE_CAPTURE_STOP_AFTER_MS = 15_000;
export const ONE_CLOSE_MAX_CONNECTED_MS = 90_000;
export const ONE_CLOSE_MAX_CONNECTIONS = 2;
export const ONE_CLOSE_READINESS_LEAD_BEFORE_CAPTURE_START_MS = 30_000;

export const TRAILING_MEMBERSHIP = "[close−60s, close)" as const;
export const QUARTER_HOUR_MEMBERSHIP = "(close−60s, close]" as const;

export class OneCloseFidelityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OneCloseFidelityError";
  }
}

export type CaptureStatus =
  | "pending"
  | "ok"
  | "bind-failed"
  | "missed-slot"
  | "connect-failed"
  | "limit-stop"
  | "not-attempted"
  | "refused-readiness";

export type OfficialStatus =
  | "pending"
  | "retrieved"
  | "unavailable"
  | "not-attempted";

export type RetentionStatus =
  | "pending"
  | "verified"
  | "failed"
  | "not-attempted"
  | "blocked-prerequisite";

export type OneClosePlan = {
  campaignId: string;
  closeUtc: string;
  closeMs: number;
  connectEarliestMs: number;
  captureStartMs: number;
  captureStopMs: number;
  readinessCutoffMs: number;
  maxConnectedMs: number;
  indexSymbol: "BRTI";
  includeOrderbook: false;
  frozenAtUtc: string;
  substitutionForbidden: true;
};
