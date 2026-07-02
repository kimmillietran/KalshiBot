import type { HistoricalResearchCliInputDocument } from "@/lib/data/fixtures";
import type {
  BidAskFidelityWarning,
  BidAskSpreadStatistics,
} from "@/lib/data/datasets/validation/audit";

export const ResearchDatasetRegistryErrorCode = {
  MISSING_FIXTURES_DIRECTORY: "missing-fixtures-directory",
  MISSING_FIXTURE: "missing-fixture",
  INVALID_FIXTURE_SCHEMA: "invalid-fixture-schema",
  DUPLICATE_MARKET_TICKER: "duplicate-market-ticker",
  BROKEN_FIXTURE_PATH: "broken-fixture-path",
  INVALID_METADATA: "invalid-metadata",
  EMPTY_DATASET: "empty-dataset",
  REGISTRY_INCONSISTENCY: "registry-inconsistency",
} as const;

export type ResearchDatasetRegistryErrorCode =
  (typeof ResearchDatasetRegistryErrorCode)[keyof typeof ResearchDatasetRegistryErrorCode];

export class ResearchDatasetRegistryError extends Error {
  readonly code: ResearchDatasetRegistryErrorCode;
  readonly marketTicker?: string;

  constructor(
    message: string,
    code: ResearchDatasetRegistryErrorCode,
    marketTicker?: string,
  ) {
    super(message);
    this.name = "ResearchDatasetRegistryError";
    this.code = code;
    this.marketTicker = marketTicker;
  }
}

export type ResearchDatasetValidationStatus = {
  valid: boolean;
  errorCount: number;
  warningCount: number;
};

export type BidAskFidelitySummary = {
  statistics: BidAskSpreadStatistics;
  warnings: readonly BidAskFidelityWarning[];
  suspiciousZeroSpread: boolean;
};

export type ResearchDatasetProvenanceSummary = {
  runId: string;
  strategyId: string;
  sources: readonly string[];
};

export type LinkedImportMetadataSummary = {
  importTimestamp: string | null;
  bronzeRecordCount: number | null;
  settlementPresent: boolean | null;
};

export type ResearchDatasetRegistryEntry = {
  seriesTicker: string;
  marketTicker: string;
  fixturePath: string;
  metadataPath: string | null;
  marketCloseTime: string | null;
  settlementPresent: boolean;
  bronzeRecordCount: number;
  btcBarCount: number;
  kalshiCandleCount: number;
  validationStatus: ResearchDatasetValidationStatus;
  bidAskFidelity: BidAskFidelitySummary;
  provenance: ResearchDatasetProvenanceSummary;
  importMetadata: LinkedImportMetadataSummary | null;
};

export type ResearchDatasetRegistrySummary = {
  marketCount: number;
  linkedMetadataCount: number;
  totalBronzeRecords: number;
  totalBtcBars: number;
  totalKalshiCandles: number;
  settlementMarketCount: number;
  validFixtureCount: number;
  suspiciousZeroSpreadMarketCount: number;
};

export type ResearchDatasetSeriesRegistry = {
  generatedAt: string;
  seriesTicker: string;
  fixturesRoot: string;
  metadataRoot: string | null;
  markets: readonly ResearchDatasetRegistryEntry[];
  summary: ResearchDatasetRegistrySummary;
};

export type BuildResearchDatasetRegistryInput = {
  fixturesRoot: string;
  metadataRoot: string | null;
  generatedAt: string;
  scanned: readonly ScannedResearchFixture[];
};

export type ScannedResearchFixture = {
  seriesTicker: string;
  marketTicker: string;
  fixturePath: string;
  metadataPath: string | null;
  fixtureJson?: string;
  metadataJson?: string;
};

export type ParsedResearchFixture = HistoricalResearchCliInputDocument;

export type ResearchDatasetRegistryIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export type BuildResearchDatasetRegistryResult = {
  registries: readonly ResearchDatasetSeriesRegistry[];
  outputPaths: readonly string[];
};
