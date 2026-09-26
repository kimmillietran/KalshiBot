/**
 * External BTC→Kalshi ingestion benchmark types.
 * Prototypes stay separate from production `externalBtcDelayedRepricingPilot` loaders.
 */

export const EXTERNAL_BTC_INGESTION_BENCHMARK_STUDY_ID =
  "kalshi-kxbtc15m-external-btc-ingestion-benchmark-v0" as const;

export const EXTERNAL_BTC_INGESTION_BENCHMARK_ANALYSIS_VERSION =
  "m17-external-btc-ingestion-benchmark-v0.1" as const;

export const EXTERNAL_BTC_INGESTION_BENCHMARK_DISCLAIMER =
  "Cloud ingestion-benchmark study only. Does not restart or modify the Mac empirical "
  + "pilot. Findings from synthetic workloads are labeled synthetic and are not "
  + "production speedups. Licensed raw samples stay gitignored.";

export type WorkloadKind =
  | "typical-depth"
  | "deep-book-high-update"
  | "away-from-best"
  | "best-price-changes"
  | "snapshot-reset-gap";

export type ReplayImplementationId =
  | "baseline-async-readline"
  | "opt-sync-buffered-lines"
  | "opt-incremental-bbo"
  | "opt-sync-plus-incremental"
  | "opt-hash-during-read";

export type StageCounters = {
  linesSeen: number;
  linesParsed: number;
  ticksApplied: number;
  bookMutations: number;
  bestScans: number;
  bboConstructed: number;
  quotesEmitted: number;
  actualBboChanges: number;
  snapshotsApplied: number;
  continuityGaps: number;
  jsonParseNs: number;
  bookMutationNs: number;
  bestScanNs: number;
  quoteEmitNs: number;
  decompressNs: number;
  lineSplitNs: number;
  hashNs: number;
  otherNs: number;
};

export type RunMetrics = {
  implementationId: ReplayImplementationId;
  workloadKind: WorkloadKind;
  profiled: boolean;
  wallMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  messagesPerSec: number;
  decompressedMbPerSec: number;
  peakRssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  externalBytes: number;
  gcPauseMsApprox: number | null;
  counters: StageCounters;
  outputHashSha256: string;
  finalBookHashSha256: string;
  inputSha256: string;
  decompressedBytes: number;
  messageCount: number;
  repeats: number;
};

export type ParityResult = {
  matched: boolean;
  quoteHashMatch: boolean;
  finalBookHashMatch: boolean;
  baselineQuotes: number;
  candidateQuotes: number;
  firstMismatch: string | null;
};

export type CachePrototypeResult = {
  attempted: boolean;
  firstIngestionWallMs: number | null;
  cacheBytes: number | null;
  cacheReadWallMs: number | null;
  subsequentSavingsRatio: number | null;
  note: string;
};

export type BenchmarkReport = {
  studyId: typeof EXTERNAL_BTC_INGESTION_BENCHMARK_STUDY_ID;
  analysisVersion: typeof EXTERNAL_BTC_INGESTION_BENCHMARK_ANALYSIS_VERSION;
  disclaimer: typeof EXTERNAL_BTC_INGESTION_BENCHMARK_DISCLAIMER;
  generatedAtUtc: string;
  pinnedCommitSha: string;
  environment: {
    nodeVersion: string;
    cpuCount: number;
    memoryTotalBytes: number;
    diskAvailableBytes: number;
    platform: string;
  };
  dataProvenance: {
    nativeSamplesAvailable: boolean;
    syntheticUsed: boolean;
    freePublicSampleUsed: boolean;
    samplingLimitations: string[];
    supplyNativeSampleInstructions: string;
  };
  workloads: Array<{
    kind: WorkloadKind;
    inputSha256: string;
    messageCount: number;
    decompressedBytes: number;
    compressedBytes: number;
    depthDistribution: Record<string, number>;
  }>;
  runs: RunMetrics[];
  parity: Array<{
    workloadKind: WorkloadKind;
    candidate: ReplayImplementationId;
    result: ParityResult;
  }>;
  cachePrototype: CachePrototypeResult;
  ranking: Array<{
    optimization: string;
    bottleneckShareEstimate: string;
    isolatedSpeedup: number | null;
    combinedSpeedup: number | null;
    outputParity: boolean;
    effortRisk: string;
  }>;
  recommendations: {
    largestOpportunity: string;
    bestLowRiskChange: string;
    dominantFactor: string;
    nativeVsSynthetic: string;
    variabilityNote: string;
    macPortabilityLimits: string;
    macReproductionCommand: string;
    nextImplementationChange: string;
  };
  attestation: {
    macPilotUntouched: true;
    noCreditSpend: true;
    noFullDayDownload: true;
    noStrategyPnl: true;
    licensedSamplesNotCommitted: true;
  };
};

export function emptyStageCounters(): StageCounters {
  return {
    linesSeen: 0,
    linesParsed: 0,
    ticksApplied: 0,
    bookMutations: 0,
    bestScans: 0,
    bboConstructed: 0,
    quotesEmitted: 0,
    actualBboChanges: 0,
    snapshotsApplied: 0,
    continuityGaps: 0,
    jsonParseNs: 0,
    bookMutationNs: 0,
    bestScanNs: 0,
    quoteEmitNs: 0,
    decompressNs: 0,
    lineSplitNs: 0,
    hashNs: 0,
    otherNs: 0,
  };
}
