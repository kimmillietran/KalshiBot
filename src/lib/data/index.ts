export { DATA_CONTRACT_VERSION } from "./versioning";
export type { DatasetVersion } from "./versioning";

export {
  UTC_ISO_PATTERN,
  isUtcIsoTimestamp,
  utcTimestampSchema,
  eventTimeSchema,
  collectionTimeSchema,
  observedAtSchema,
  temporalFieldsSchema,
} from "./timestamps";
export type {
  EventTime,
  CollectionTime,
  ObservedAt,
  TemporalFields,
} from "./timestamps";

export { DataSource, dataSourceSchema, fetchProvenanceSchema } from "./provenance";
export type { FetchProvenance } from "./provenance";

export {
  DataQualityFlag,
  dataQualityFlagSchema,
  datasetVersionSchema,
  historicalTickerSchema,
  seriesTickerSchema,
  rawHistoricalRecordSchema,
  marketWindowSchema,
  kalshiCandle1mSchema,
  btcBar1mSchema,
  settlementRecordSchema,
} from "./schemas";

export type {
  HistoricalTicker,
  SeriesTicker,
  RawHistoricalRecord,
  MarketWindow,
  KalshiCandle1m,
  BtcBar1m,
  SettlementRecord,
} from "./types";

export {
  BRONZE_KEY_PREFIX,
  buildBronzeRecordKey,
  bronzeKeyFromRecord,
  isBronzeRecordKey,
  recordIdFromBronzeKey,
  InMemoryBronzeStore,
  bronzeRecordsAreIdentical,
  cloneBronzeRecord,
  parseSerializedBronzeRecord,
  serializeBronzeRecord,
  BronzeDuplicateConflictError,
} from "./bronze";

export type {
  BronzeRecordFilter,
  BronzeRecordKey,
  BronzeStore,
} from "./bronze";

export {
  SilverNormalizer,
  normalizeRecord,
  normalizeMarketWindow,
  normalizeKalshiCandle,
  normalizeSettlement,
  SILVER_BRONZE_CONTENT_TYPE,
  SilverNormalizationError,
  SilverUnsupportedContentTypeError,
  SilverMalformedPayloadError,
  SilverInvalidBronzeRecordError,
} from "./silver";

export type {
  SilverBronzeContentType,
  SilverNormalizationOutput,
  SilverNormalizationResult,
} from "./silver";

export {
  assembleHistoricalTradingSnapshot,
  serializeHistoricalTradingSnapshot,
  HistoricalSnapshotAssemblyError,
  SnapshotAssemblyErrorCode,
} from "./snapshots";
export type {
  HistoricalSnapshotProvenance,
  HistoricalTradingSnapshot,
  SilverRecordEnvelope,
  SnapshotAssemblyInput,
  SnapshotTemporalMetadata,
} from "./snapshots";

export {
  adaptHistoricalSnapshot,
  ReplayAdaptationError,
  ReplayAdaptationErrorCode,
  REPLAY_BTC_FEED_STATUS,
  REPLAY_BTC_PROVIDER_SOURCE,
  ReplayTimeline,
  orderReplaySnapshots,
  ReplaySession,
  serializeReplaySessionState,
  serializeReplayStepResult,
  serializeReplayStepResults,
} from "./replay";

export type {
  HistoricalReplayAdaptation,
  CreateReplayTimelineInput,
  ReplayTimelineCursor,
  ReplayTimelineSnapshotSequence,
  ReplayTimelineState,
  CreateReplaySessionInput,
  ReplaySessionState,
  ReplayStepAllOutput,
  ReplayStepOutput,
  ReplayStepResult,
} from "./replay";

export {
  DEFAULT_POLLING_RATE_GOVERNOR_CONFIG,
  PollingRateGovernor,
  applyPollIntervalJitter,
  validatePollingRateGovernorConfig,
  MARKET_POLL_PRIORITY_WEIGHT,
  intervalMsForPriority,
  PollingRateGovernorConfigError,
} from "./polling";
export type {
  JitterSample,
  MarketPollPriority,
  MarketPollState,
  PollIntervalDecision,
  PollReadiness,
  PollThrottleReason,
  PollingRateGovernorConfig,
  StaleQuoteStatus,
} from "./polling";

export {
  BacktestLedger,
  BacktestStrategyRunner,
  BacktestLedgerError,
  BacktestLedgerErrorCode,
  computeBacktestMetrics,
  serializeBacktestMetrics,
  BacktestMetricsError,
  BacktestMetricsErrorCode,
  BacktestIntentRejectionCode,
  BacktestStrategyRunnerError,
  BacktestStrategyRunnerErrorCode,
  runMonteCarloAnalysis,
  serializeMonteCarloSummary,
  DEFAULT_DETERMINISTIC_INDEX_GENERATOR,
  MonteCarloAnalysisError,
  MonteCarloErrorCode,
  ResampleMode,
  DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
  deriveBacktestMetricsInput,
  runHistoricalBacktest,
  serializeHistoricalBacktestResult,
  HistoricalBacktestError,
  HistoricalBacktestErrorCode,
  positionKey,
} from "./backtesting";

export type {
  BacktestEquityPoint,
  BacktestMetricsSummary,
  ClosedTradeSummary,
  ComputeBacktestMetricsInput,
  LedgerSnapshot,
  MarkPrice,
  OpenPosition,
  TradeAction,
  TradeFill,
  TradeFillInput,
  TradeSide,
  UnrealizedPnLResult,
  BacktestFillSimulationConfig,
  BacktestStepRunnerResult,
  BacktestStrategy,
  BacktestStrategyContext,
  BacktestStrategyRunInput,
  BacktestStrategyRunResult,
  RejectedTradeIntent,
  SimulatedFill,
  TradeIntent,
  DeterministicIndexContext,
  DeterministicIndexGenerator,
  MonteCarloConfig,
  MonteCarloRun,
  MonteCarloSummary,
  ResampleModeType,
  ResampledTradeSequence,
  RunMonteCarloAnalysisInput,
  DeriveBacktestMetricsInputArgs,
  HistoricalBacktestMetadata,
  HistoricalBacktestMetricsConfig,
  HistoricalBacktestReplayResult,
  HistoricalBacktestResult,
  RunHistoricalBacktestInput,
} from "./backtesting";

export {
  runResearchExperiment,
  serializeResearchExperimentResult,
  ResearchExperimentError,
  ResearchExperimentErrorCode,
  generateParameterCombinations,
  runParameterSweep,
  serializeParameterSweepResult,
  ParameterSweepError,
  ParameterSweepErrorCode,
  ParameterSweepExperimentFactoryError,
  generateWalkForwardWindows,
  runWalkForwardValidation,
  runWalkForwardResearchExperiment,
  serializeWalkForwardResult,
  WalkForwardValidationError,
  WalkForwardErrorCode,
} from "./research";

export type {
  ResearchExperimentConfig,
  ResearchExperimentConfiguration,
  ResearchExperimentInput,
  ResearchExperimentResult,
  ResearchStrategyConfig,
  RunResearchExperimentInput,
  ParameterCombination,
  ParameterSweepConfig,
  ParameterSweepExperimentConfig,
  ParameterSweepExperimentResult,
  ParameterSweepResult,
  RunParameterSweepExperimentFn,
  RunParameterSweepOptions,
  SweepParameter,
  RunWalkForwardExperimentFn,
  RunWalkForwardValidationInput,
  RunWalkForwardValidationOptions,
  WalkForwardConfig,
  WalkForwardPhase,
  WalkForwardResult,
  WalkForwardRunResult,
  WalkForwardWindow,
} from "./research";

export {
  buildHistoricalDataset,
  normalizeBtcKlineBronze,
  serializeHistoricalDataset,
  DATASET_BRONZE_CONTENT_TYPE,
  HistoricalDatasetBuildError,
  HistoricalDatasetBuildErrorCode,
} from "./datasets";
export type {
  DatasetBronzeContentType,
  HistoricalDataset,
  HistoricalDatasetMetadata,
  HistoricalDatasetProvenanceSummary,
} from "./datasets";

export {
  compareResearchExperiments,
  serializeResearchComparison,
  COMPARISON_METRIC_ORDER,
  ComparisonMetricId,
  ResearchComparisonError,
  ResearchComparisonErrorCode,
} from "./research/comparison";
export type {
  ComparisonMetricTableRow,
  ComparisonMetricValues,
  ComparisonSummary,
  ComparisonTieGroup,
  MetricDominanceEntry,
  RankedExperiment,
  ResearchComparison,
  ResearchExperimentResultWithMetrics,
} from "./research/comparison";

export {
  runHistoricalResearchFromBronze,
  serializeHistoricalResearchRunnerResult,
  HistoricalResearchRunnerError,
  HistoricalResearchRunnerErrorCode,
} from "./research/runner";
export type {
  HistoricalResearchRunnerCoreResult,
  HistoricalResearchRunnerMetadata,
  HistoricalResearchRunnerResult,
  RunHistoricalResearchFromBronzeInput,
} from "./research/runner";

export {
  HistoricalResearchCli,
  serializeHistoricalResearchRun,
  HistoricalResearchCliError,
  HistoricalResearchCliErrorCode,
  HistoricalResearchProgressEventType,
} from "./cli";
export type {
  HistoricalResearchProgressEvent,
  HistoricalResearchRun,
  HistoricalResearchRunConfig,
  RunAllHistoricalResearchInput,
  RunHistoricalResearchInput,
} from "./cli";
