export const BRTI_ACCESS_PROBE_STUDY_ID = "kalshi-kxbtc15m-brti-access-probe-v0" as const;
export const BRTI_INDEX_ID = "BRTI" as const;

export const DEFAULT_PROBE_OUT_DIR =
  "data/research-results/external-kalshi-data-audit/m17-prep-brti-access-probe" as const;
export const DEFAULT_PROBE_RAW_DIR =
  "data/research-results/external-kalshi-data-audit/m17-prep-brti-access-probe/raw" as const;
export const V1_PROBE_OUT_DIR =
  "data/research-results/external-kalshi-data-audit/m17-prep-brti-access-probe-v1" as const;
export const V1_PROBE_RAW_DIR =
  "data/research-results/external-kalshi-data-audit/m17-prep-brti-access-probe-v1/raw" as const;

export const FRICTION_MANIFEST_RELATIVE_PATH =
  "data/research-results/external-kalshi-data-audit/m17-prep-settlement-friction-coverage/settlement-friction-coverage-manifest.json" as const;
export const BLIND_INCIDENCE_RELATIVE_PATH =
  "data/research-results/external-kalshi-data-audit/m16-er-blind-incidence.json" as const;
export const INCOMPLETE_RECORDS_RELATIVE_PATH =
  "data/research-results/external-kalshi-data-audit/m17-prep-settlement-friction-label-coverage/incomplete-records.json" as const;

export const EXCLUDED_MISSING_STRIKE_TICKER = "KXBTC15M-26AUG140315-15" as const;

export const MAX_HTTP_REQUESTS = 10 as const;
export const MAX_RETRIES_PER_REQUEST = 1 as const;
export const MAX_MINUTES_PER_TARGET = 2 as const;
export const LIVE_DURATION_SECONDS = 90 as const;
export const LIVE_MESSAGE_CAP = 600 as const;

export const CFB_VALUES_SIGN_PATH = "/trade-api/v2/cfbenchmarks/values" as const;
export const CFB_HISTORY_SIGN_PATH = "/trade-api/v2/cfbenchmarks/history/values" as const;

export class KalshiBrtiAccessProbeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KalshiBrtiAccessProbeError";
  }
}

export type HttpErrorCategory =
  | "authentication-failure"
  | "entitlement-denial"
  | "not-found"
  | "invalid-parameters"
  | "rate-limited"
  | "upstream-or-transient"
  | "success"
  | "empty-success"
  | "unknown";

export type ProbeClassification =
  | "access-available-suitable-for-specified-next-step"
  | "access-available-with-identified-limitations"
  | "blocked-by-entitlement-credentials-retention-or-semantics"
  | "inconclusive-within-bounded-probe";

export type SpentTarget = {
  role: "early" | "middle" | "late";
  utcDay: string;
  marketTicker: string;
};

export type OfficialNumericParse =
  | { kind: "ok"; original: string; value: number; usedThousandsSeparators: boolean }
  | { kind: "empty"; original: string }
  | { kind: "rejected"; original: string; reason: string };

export type SignedGetResult = {
  url: string;
  signPath: string;
  status: number;
  category: HttpErrorCategory;
  body: unknown;
  bodyTextHash: string;
  attempt: number;
};

export type HistoryObservation = {
  timeRaw: string | number | null;
  timeMs: number | null;
  valueRaw: string | null;
  value: number | null;
};

export type CadenceInspection = {
  observationCount: number;
  uniqueSecondBuckets: number;
  medianIntervalMs: number | null;
  minIntervalMs: number | null;
  maxIntervalMs: number | null;
  looksOneHz: boolean;
  looksFiveHz: boolean;
  duplicateTimeCount: number;
  outOfOrderCount: number;
  missingTimeCount: number;
};

export type SettlementMappingSupport =
  | {
      supported: true;
      reason: "venue-provided-window-average-documented";
      sampleCount: number;
    }
  | {
      supported: false;
      reason: string;
      observedWindowCount?: number;
      uniqueSecondBuckets?: number;
    };

export type ParsedProbeArgv = {
  fixture: boolean;
  skipLive: boolean;
  skipHttp: boolean;
  skipLatest: boolean;
  followUp: boolean;
  campaignId: string;
  campaignDir: string;
  skipHistory: boolean;
  waitForClose: boolean;
  outDir: string;
  rawDir: string;
  maxHttpRequests: number;
  maxRetriesPerRequest: number;
  liveDurationSeconds: number;
  liveMessageCap: number;
};
