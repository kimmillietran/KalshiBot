export const SETTLEMENT_SAMPLE_MAPPING_STUDY_ID =
  "kalshi-kxbtc15m-settlement-sample-mapping-v2" as const;
export const V2_MAPPING_CAMPAIGN_ID = SETTLEMENT_SAMPLE_MAPPING_STUDY_ID;

export const DEFAULT_MAPPING_OUT_DIR =
  "data/research-results/external-kalshi-data-audit/m17-prep-settlement-sample-mapping" as const;
export const DEFAULT_MAPPING_RAW_DIR =
  "data/research-results/external-kalshi-data-audit/m17-prep-settlement-sample-mapping/raw" as const;

export const EXPECTED_RETAINED_HISTORY_BODY_SHA256 =
  "c6c6613033990431b917c298242776b0e3546dffd4d3198df0044593c9ef016b" as const;
export const HISTORICAL_INSPECTION_TICKER = "KXBTC15M-26AUG301415-15" as const;
export const HISTORICAL_INSPECTION_HOUR_START_UTC = "2026-08-30T18:00:00.000Z" as const;
export const HISTORICAL_INSPECTION_HOUR_END_EXCLUSIVE_UTC = "2026-08-30T19:00:00.000Z" as const;

export const MAPPING_PRE_CLOSE_MS = 90_000;
export const MAPPING_POST_CLOSE_MS = 30_000;
export const MAPPING_MAX_DURATION_MS = 120_000;
export const MAPPING_MAX_MESSAGES = 150_000;
export const MAPPING_MAX_RAW_BYTES = 250 * 1024 * 1024;
export const MAPPING_MAX_CONNECTIONS_PER_STREAM = 2;
export const MAPPING_MAX_HTTP = 10;
export const MAPPING_MAX_POST_CLOSE_SETTLEMENT = 3;
export const MAPPING_MAX_RETRY_DELAY_MS = 2_000;

export const CFB_1HZ_CHANNEL = "cfbenchmarks_value" as const;
export const CFB_5HZ_CHANNEL = "cfbenchmarks_value_5hz" as const;
export const ORDERBOOK_CHANNEL = "orderbook_delta" as const;

export class SettlementSampleMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementSampleMappingError";
  }
}

export type WindowBoundaryKind =
  | "documented-live-accumulation"
  | "payload-start-inclusive-end-exclusive"
  | "closed-both"
  | "open-both";

export type AggregationKind = "last-tick-per-second" | "all-5hz-mean";

export type MappingStatus =
  | "documented"
  | "consistent-with-observations"
  | "uniquely-identified"
  | "unresolved";

export type AverageFieldKind = "settlement-window" | "trailing-60s" | "unknown";

export type TimedObservation = {
  timeRaw: string | number | null;
  timeMs: number | null;
  valueRaw: string | null;
  value: number | null;
};

export type ParsedMappingArgv = {
  fixture: boolean;
  skipLive: boolean;
  skipHttp: boolean;
  skipOffline: boolean;
  waitForClose: boolean;
  campaignId: string;
  campaignDir: string;
  outDir: string;
  rawDir: string;
  maxHttpRequests: number;
  maxPostCloseSettlement: number;
};
