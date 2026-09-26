export {
  EXTERNAL_BTC_INGESTION_BENCHMARK_STUDY_ID,
  EXTERNAL_BTC_INGESTION_BENCHMARK_ANALYSIS_VERSION,
  EXTERNAL_BTC_INGESTION_BENCHMARK_DISCLAIMER,
  emptyStageCounters,
  type WorkloadKind,
  type ReplayImplementationId,
  type StageCounters,
  type RunMetrics,
  type ParityResult,
  type CachePrototypeResult,
  type BenchmarkReport,
} from "./types";

export {
  buildSyntheticWorkloads,
  materializeWorkloadZstd,
  linesSha256,
  type SyntheticWorkload,
} from "./syntheticWorkload";

export { replayBaselineAsync, measureRun, hashQuotes, hashBook } from "./baselineReplay";
export {
  createIncrementalBook,
  applyTickIncremental,
  replaySyncBuffered,
  replayFromLinesForParity,
} from "./optimizedReplay";
export { compareQuoteStreams } from "./parity";
export {
  CACHE_SCHEMA_VERSION,
  CACHE_EMISSION_POLICY,
  cacheKey,
  writeSparseQuoteCache,
  readSparseQuoteCache,
  measureCachePrototype,
} from "./cachePrototype";
export { runExternalBtcIngestionBenchmark, readBenchmarkReport } from "./runBenchmark";
