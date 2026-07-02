export const BID_ASK_FIDELITY_WARNING_CODE = {
  ALL_CANDLES_ZERO_SPREAD: "all-candles-zero-spread",
  HIGH_ZERO_SPREAD: "high-zero-spread",
  INVERTED_SPREADS: "inverted-spreads",
  MISSING_BID_ASK_FIELDS: "missing-bid-ask-fields",
  LIVE_CLOSE_ONLY_QUOTES: "live-close-only-quotes",
  NO_CANDLES: "no-candles",
} as const;

export type BidAskFidelityWarningCode =
  (typeof BID_ASK_FIDELITY_WARNING_CODE)[keyof typeof BID_ASK_FIDELITY_WARNING_CODE];

export const DEFAULT_HIGH_ZERO_SPREAD_THRESHOLD_PERCENT = 90;

export const DEFAULT_BID_ASK_AUDIT_INPUT_DIR = "data/imports";
export const DEFAULT_BID_ASK_AUDIT_OUTPUT_PATH = "data/audits/bid-ask-fidelity.json";
export const FIXTURE_FILENAME = "fixture.json";
export const IMPORT_METADATA_FILENAME = "metadata.json";

export type BidAskCandleQuoteSource =
  | "legacy-bid-ask"
  | "live-close-only"
  | "missing";

export type BidAskCandleQuote = {
  source: BidAskCandleQuoteSource;
  yesBidCents: number | null;
  yesAskCents: number | null;
};

export type BidAskSpreadStatistics = {
  candleCount: number;
  equalBidAskCount: number;
  bidLessThanAskCount: number;
  bidGreaterThanAskCount: number;
  missingBidAskCount: number;
  liveCloseOnlyCount: number;
  minSpreadCents: number | null;
  averageSpreadCents: number | null;
  maxSpreadCents: number | null;
  percentZeroSpread: number | null;
  percentInvertedSpread: number | null;
};

export type BidAskFidelityWarning = {
  code: BidAskFidelityWarningCode;
  severity: "warning";
  message: string;
};

export type BidAskFidelityMarketResult = {
  seriesTicker: string;
  marketTicker: string;
  sourcePath: string;
  statistics: BidAskSpreadStatistics;
  warnings: readonly BidAskFidelityWarning[];
  suspiciousZeroSpread: boolean;
};

export type BidAskFidelitySeriesSummary = {
  seriesTicker: string;
  marketCount: number;
  candleCount: number;
  suspiciousZeroSpreadMarketCount: number;
  markets: readonly BidAskFidelityMarketResult[];
  statistics: BidAskSpreadStatistics;
  warnings: readonly BidAskFidelityWarning[];
};

export type BidAskFidelityReportSummary = {
  seriesCount: number;
  marketCount: number;
  candleCount: number;
  suspiciousZeroSpreadMarketCount: number;
  statistics: BidAskSpreadStatistics;
  warnings: readonly BidAskFidelityWarning[];
};

export type BidAskFidelityReport = {
  generatedAt: string;
  inputDir: string;
  outputPath: string;
  series: readonly BidAskFidelitySeriesSummary[];
  summary: BidAskFidelityReportSummary;
};

export type ScannedBidAskAuditDataset = {
  seriesTicker: string;
  marketTicker: string;
  sourcePath: string;
  bronzeRecords: readonly import("@/lib/data/types").RawHistoricalRecord[];
};

export type BidAskFidelityAuditIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export type BuildBidAskFidelityReportInput = {
  inputDir: string;
  outputPath: string;
  generatedAt: string;
  datasets: readonly ScannedBidAskAuditDataset[];
  highZeroSpreadThresholdPercent?: number;
};
