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
  buildHistoricalDatasetManifest,
  serializeHistoricalDatasetManifest,
  DATASET_BRONZE_CONTENT_TYPE,
  HistoricalDatasetBuildError,
  HistoricalDatasetBuildErrorCode,
  validateHistoricalBronzeDataset,
  serializeHistoricalBronzeValidation,
  HistoricalBronzeValidationErrorCode,
  buildHistoricalBronzeValidationReport,
  serializeHistoricalBronzeValidationReport,
} from "./datasets";
export type {
  DatasetBronzeContentType,
  HistoricalDataset,
  HistoricalDatasetMetadata,
  HistoricalDatasetProvenanceSummary,
  HistoricalBronzeValidationIssue,
  HistoricalBronzeValidationResult,
  HistoricalBronzeValidationSeverity,
  HistoricalBronzeValidationStatistics,
  BuildHistoricalDatasetManifestInput,
  HistoricalDatasetManifest,
  HistoricalDatasetManifestGeneratedMetadata,
  BuildHistoricalBronzeValidationReportInput,
  HistoricalBronzeValidationIssuesByCodeEntry,
  HistoricalBronzeValidationIssuesByTickerEntry,
  HistoricalBronzeValidationReport,
  HistoricalBronzeValidationReportMetadata,
  HistoricalBronzeValidationReportSummary,
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

export {
  buildResearchComparisonExport,
  buildResearchRunExport,
  serializeResearchExportDocument,
  RESEARCH_EXPORT_TABLE_COLUMNS,
  ResearchExportError,
  ResearchExportErrorCode,
  ResearchExportType,
  summaryMetricsFromBacktest,
  DEFAULT_RESEARCH_EXPORT_JSON_FORMAT_OPTIONS,
  ResearchExportJsonError,
  ResearchExportJsonErrorCode,
  formatResearchExportJson,
  formatResearchExportSummaryJson,
} from "./research/export";
export type {
  BuildResearchComparisonExportInput,
  BuildResearchRunExportInput,
  ResearchExportDocument,
  ResearchExportGeneratedMetadata,
  ResearchExportJsonFormatOptions,
  ResearchExportRankingRow,
  ResearchExportSummaryJsonPayload,
  ResearchExportSummaryMetrics,
  ResearchExportTableColumn,
  ResearchExportTableRow,
} from "./research/export";

export {
  StrategyRegistry,
  noopStrategyDefinition,
  buyFirstAskStrategyDefinition,
  BUILTIN_STRATEGY_IDS,
  StrategyRegistryError,
  StrategyRegistryErrorCode,
} from "./strategies";
export type {
  BuiltinStrategyId,
  CreateStrategyRegistryInput,
  StrategyDefinition,
  StrategyRegistrySnapshot,
} from "./strategies";

export {
  buildHistoricalResearchFixture,
  serializeHistoricalResearchFixture,
  HistoricalFixtureError,
  HistoricalFixtureErrorCode,
} from "./fixtures";
export type {
  BuildHistoricalResearchFixtureInput,
  HistoricalResearchCliInput,
  HistoricalResearchFixtureExportConfig,
  HistoricalResearchInput,
} from "./fixtures";

export {
  DEFAULT_KXBTC15M_SERIES_TICKER,
  MarketDiscoveryError,
  MarketDiscoveryErrorCode,
  discoverKalshiHistoricalMarkets,
  serializeMarketDiscoveryResult,
  normalizeDiscoveredMarket,
  validateMarketDiscoveryResult,
  createKalshiHistoricalMarketDiscoveryFromFetch,
} from "./discovery";
export type {
  DiscoveredMarket,
  MarketDiscoveryMetadata,
  MarketDiscoveryProvenance,
  MarketDiscoveryResult,
  MarketDiscoveryValidationIssue,
  MarketDiscoveryValidationResult,
  DiscoverKalshiHistoricalMarketsInput,
  KalshiHistoricalMarketDiscoveryOptions,
  NormalizeDiscoveredMarketInput,
} from "./discovery";

export {
  runHistoricalBronzeImportJob,
  serializeHistoricalBronzeImportResult,
  createKalshiHistoricalBronzeProvider,
  createPrefetchedKalshiHistoricalBronzeProvider,
  prefetchKalshiHistoricalBronzeImporter,
  BtcHistoricalBronzeProviderError,
  BtcHistoricalBronzeProviderErrorCode,
  compareBtcBronzeRecords,
  BtcImporterBronzeProviderAdapterError,
  BtcImporterBronzeProviderAdapterErrorCode,
  createBtcHistoricalBronzeProviderFromImporter,
  createInMemoryBtcHistoricalBronzeProvider,
  mapBtcHistoricalBarToBronzeRecord,
  serializeBtcBronzeRecords,
  sortBtcBronzeRecords,
  validateBtcHistoricalBar,
  runConfiguredHistoricalBronzeImport,
  createHistoricalImportProvidersFromConfig,
  runHistoricalImportFromConfig,
  HistoricalImportBootstrapError,
  HistoricalImportBootstrapErrorCode,
  ImportFixtureBridgeError,
  ImportFixtureBridgeErrorCode,
  buildHistoricalResearchFixtureFromImportResult,
  serializeHistoricalResearchFixtureFromImportResult,
} from "./importJobs";
export type {
  BtcHistoricalBar,
  BtcHistoricalBronzeProvider,
  BtcHistoricalBronzeProviderImportInput,
  CreateInMemoryBtcHistoricalBronzeProviderInput,
  CreateBtcHistoricalBronzeProviderFromImporterInput,
  CreateKalshiHistoricalBronzeProviderInput,
  CreatePrefetchedKalshiHistoricalBronzeProviderInput,
  PrefetchKalshiHistoricalBronzeImporterInput,
  PrefetchedKalshiHistoricalBronzeState,
  HistoricalBronzeImportJobCoreResult,
  HistoricalBronzeImportJobMetadata,
  HistoricalBronzeImportJobResult,
  HistoricalBronzeProviderImportInput,
  KalshiHistoricalBronzeImporter,
  KalshiHistoricalBronzeProvider,
  KalshiHistoricalBronzeProviderContext,
  KalshiHistoricalBronzeProviderMethodInput,
  MapBtcHistoricalBarToBronzeRecordInput,
  RunConfiguredHistoricalBronzeImportInput,
  RunHistoricalBronzeImportJobInput,
  CreateHistoricalImportProvidersFromConfigInput,
  HistoricalImportFetchLike,
  HistoricalImportProviders,
  RunHistoricalImportFromConfigInput,
  BuildHistoricalResearchFixtureFromImportResultInput,
} from "./importJobs";

export {
  buildHistoricalBronzeImportConfig,
  serializeHistoricalBronzeImportConfig,
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportConfigError,
  HistoricalBronzeImportConfigErrorCode,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportOutputFormat,
} from "./importJobs/config";
export type {
  BuildHistoricalBronzeImportConfigInput,
  HistoricalBronzeImportBtcConfig,
  HistoricalBronzeImportConfig,
  HistoricalBronzeImportConfigMetadata,
  HistoricalBronzeImportKalshiConfig,
  HistoricalBronzeImportOutputConfig,
} from "./importJobs/config";

export {
  BtcHistoricalHttpAdapter,
  BtcHistoricalHttpAdapterError,
  BtcHistoricalImporterError,
  BtcHistoricalImporterErrorCode,
  BtcHistoricalInterval,
  DEFAULT_BINANCE_SPOT_KLINES_BASE,
  buildBinanceKlinesUrl,
  createBtcHistoricalImporter,
  CoinbaseHistoricalHttpAdapter,
  CoinbaseHistoricalHttpAdapterError,
  COINBASE_HISTORICAL_PRODUCT_ID,
  COINBASE_MAX_CANDLES_PER_REQUEST,
  DEFAULT_COINBASE_EXCHANGE_API_BASE,
  buildCoinbaseCandlesUrl,
  createCoinbaseHistoricalImporter,
} from "./importers/btc";
export type {
  BtcHistoricalHttpAdapterOptions,
  BtcHistoricalHttpClient,
  BtcHistoricalHttpFetchKlinesInput,
  BtcHistoricalImporter,
  BtcHistoricalImporterBar,
  CreateBtcHistoricalImporterInput,
  FetchLike as BtcHistoricalFetchLike,
  GetHistoricalBarsInput,
  CoinbaseHistoricalHttpAdapterOptions,
  CoinbaseHistoricalHttpClient,
  CoinbaseHistoricalHttpFetchCandlesInput,
  CreateCoinbaseHistoricalImporterInput,
  FetchLike as CoinbaseHistoricalFetchLike,
} from "./importers/btc";
