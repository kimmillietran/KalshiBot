export const QUOTE_FIDELITY_GATE_FILENAME = "quote-fidelity-gate.json";
export const DEFAULT_QUOTE_FIDELITY_GATE_OUTPUT_PATH =
  "data/research-results/quote-fidelity-gate.json";
export const DEFAULT_QUOTE_FIDELITY_GATE_HTML_OUTPUT_PATH =
  "data/reports/quote-fidelity-gate.html";

export const DEFAULT_DATASET_REGISTRY_PATH =
  "data/research-datasets/KXBTC15M/dataset-registry.json";
export const DEFAULT_FIXTURES_DIR = "data/fixtures/KXBTC15M";
export const DEFAULT_RESEARCH_RESULTS_DIR = "data/research-results";

export const QuoteFidelityGateErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_INPUT: "missing-input",
} as const;

export type QuoteFidelityGateErrorCode =
  (typeof QuoteFidelityGateErrorCode)[keyof typeof QuoteFidelityGateErrorCode];

export class QuoteFidelityGateError extends Error {
  readonly code: QuoteFidelityGateErrorCode;

  constructor(message: string, code: QuoteFidelityGateErrorCode) {
    super(message);
    this.name = "QuoteFidelityGateError";
    this.code = code;
  }
}

export const QUOTE_FIDELITY_GATE_VERDICTS = [
  "proceed-cross-strike-ladder",
  "proceed-static-parity",
  "blocked-no-ladder",
  "blocked-needs-live-quotes",
  "blocked-close-only-quotes",
  "blocked-missing-event-metadata",
  "blocked-insufficient-data",
] as const;

export type QuoteFidelityGateVerdict =
  (typeof QUOTE_FIDELITY_GATE_VERDICTS)[number];

export const QUOTE_FIDELITY_RECOMMENDED_NEXT_ACTIONS = [
  "start-forward-live-quote-capture",
  "build-lead-lag-close-proxy-diagnostic",
  "proceed-m12.1-static-parity",
  "proceed-m12.1-cross-strike-ladder",
  "no-action-current-corpus-insufficient",
] as const;

export type QuoteFidelityRecommendedNextAction =
  (typeof QUOTE_FIDELITY_RECOMMENDED_NEXT_ACTIONS)[number];

export type QuoteFidelityGateConfig = {
  seriesTicker: string;
  highLiveCloseOnlyShareThreshold: number;
  highZeroSpreadShareThreshold: number;
  fixtureSampleSize: number;
  researchOutputSampleSize: number;
};

export type QuoteFidelityGateInputPaths = {
  datasetRegistryPath: string;
  fixturesDir: string;
  researchResultsDir: string;
};

export type MarketUniverseSummary = {
  seriesTicker: string;
  marketCount: number;
  registryMarketCount: number;
  researchOutputMarketCount: number | null;
  fixtureMarketCount: number | null;
  monthsCovered: readonly string[];
  tradingDaysCovered: number;
  earliestMarket: string | null;
  latestMarket: string | null;
  canonicalMarketCountSource: string;
  marketCountNotes: string;
};

export type QuoteFidelitySummary = {
  totalMarkets: number;
  marketsWithBidAskFidelityWarnings: number;
  liveCloseOnlyQuoteCount: number;
  liveCloseOnlyQuoteShare: number;
  zeroSpreadMarketCount: number;
  zeroSpreadMarketShare: number;
  legacyBidAskCount: number;
  unknownQuoteFidelityCount: number;
  percentZeroSpread: number | null;
  executableParityResearchFeasible: boolean;
  executableCrossSpreadResearchFeasible: boolean;
  reason: string;
  blockingFields: readonly string[];
};

export type LadderHistogramEntry = {
  strikesPerEvent: number;
  eventCount: number;
};

export type LadderSampleEvent = {
  eventTicker: string;
  strikeCount: number;
  marketTickers: readonly string[];
  floorStrikes: readonly number[];
  eventTickerSource: "fixture" | "parsed" | "mismatch";
};

export type LadderFeasibilitySummary = {
  eventCount: number;
  eventsWith1Strike: number;
  eventsWith2PlusStrikes: number;
  eventsWith3PlusStrikes: number;
  maxStrikesPerEvent: number;
  medianStrikesPerEvent: number | null;
  meanStrikesPerEvent: number | null;
  ladderHistogram: readonly LadderHistogramEntry[];
  sampleEvents: readonly LadderSampleEvent[];
  ladderResearchFeasible: boolean;
  parsedVsFixtureMismatchCount: number;
};

export type FieldAvailabilityEntry = {
  field: string;
  present: boolean;
  source: string | null;
  notes: string;
};

export type FeeSmokeCheckSummary = {
  feeHelperPath: string;
  feeSchedule: string;
  sampleContractPriceCents: number;
  sampleYesAskCents: number;
  sampleNoAskCents: number;
  sampleYesFeeCents: number;
  sampleNoFeeCents: number;
  zeroSpreadParityNetEdgeCents: number;
  buyBothParityProfitableAfterFees: boolean;
};

export type QuoteFidelityGateReportSummary = {
  seriesTicker: string;
  marketCount: number;
  eventCount: number;
  eventsWith2PlusStrikes: number;
  eventsWith3PlusStrikes: number;
  maxStrikesPerEvent: number;
  liveCloseOnlyQuoteShare: number;
  zeroSpreadMarketShare: number;
  ladderResearchFeasible: boolean;
  executableParityResearchFeasible: boolean;
  executableCrossSpreadResearchFeasible: boolean;
  verdict: QuoteFidelityGateVerdict;
  recommendedNextAction: QuoteFidelityRecommendedNextAction;
};

export type QuoteFidelityGateReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  config: QuoteFidelityGateConfig;
  inputPaths: QuoteFidelityGateInputPaths;
  summary: QuoteFidelityGateReportSummary;
  marketUniverse: MarketUniverseSummary;
  quoteFidelity: QuoteFidelitySummary;
  ladderFeasibility: LadderFeasibilitySummary;
  fieldAvailability: readonly FieldAvailabilityEntry[];
  feeSmokeCheck: FeeSmokeCheckSummary;
  warnings: readonly string[];
};

export type QuoteFidelityGateIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export type RegistryMarketRecord = {
  marketTicker: string;
  marketCloseTime: string | null;
  bidAskFidelity: {
    statistics: {
      candleCount: number;
      liveCloseOnlyCount: number;
      percentZeroSpread: number | null;
      equalBidAskCount: number;
    };
    warnings: readonly { code: string }[];
    suspiciousZeroSpread: boolean;
  };
  fixturePath: string;
};

export type LoadedQuoteFidelityGateInputs = {
  seriesTicker: string;
  registryMarketCount: number;
  markets: readonly RegistryMarketRecord[];
  fixtureSamplePaths: readonly string[];
  researchOutputMarketCount: number | null;
};
