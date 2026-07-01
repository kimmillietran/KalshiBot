export {
  runResearchExperiment,
  serializeResearchExperimentResult,
} from "./ResearchExperiment";

export {
  ResearchExperimentError,
  ResearchExperimentErrorCode,
} from "./experimentTypes";

export type {
  ResearchExperimentConfig,
  ResearchExperimentConfiguration,
  ResearchExperimentInput,
  ResearchExperimentResult,
  ResearchStrategyConfig,
  RunResearchExperimentInput,
} from "./experimentTypes";

export {
  generateParameterCombinations,
  runParameterSweep,
  serializeParameterSweepResult,
  validateParameterSweepConfig,
  validateParameterSweepExperimentConfig,
  validateSweepParameters,
} from "./ParameterSweep";

export {
  generateWalkForwardWindows,
  runWalkForwardValidation,
  runWalkForwardResearchExperiment,
  serializeWalkForwardResult,
  validateWalkForwardConfig,
} from "./WalkForwardValidator";
export {
  ParameterSweepError,
  ParameterSweepErrorCode,
  ParameterSweepExperimentFactoryError,
  WalkForwardValidationError,
  WalkForwardErrorCode,
} from "./errors";

export type {
  ParameterCombination,
  ParameterSweepConfig,
  ParameterSweepExperimentConfig,
  ParameterSweepExperimentResult,
  ParameterSweepResult,
  RunParameterSweepExperimentFn,
  RunParameterSweepOptions,
  SweepParameter,
} from "./parameterSweepTypes";
export type {
  RunWalkForwardExperimentFn,
  RunWalkForwardValidationInput,
  RunWalkForwardValidationOptions,
  WalkForwardConfig,
  WalkForwardPhase,
  WalkForwardResult,
  WalkForwardRunResult,
  WalkForwardWindow,
} from "./walkForwardTypes";

export {
  runHistoricalResearchFromBronze,
  serializeHistoricalResearchRunnerResult,
  HistoricalResearchRunnerError,
  HistoricalResearchRunnerErrorCode,
} from "./runner";
export type {
  HistoricalResearchRunnerCoreResult,
  HistoricalResearchRunnerMetadata,
  HistoricalResearchRunnerResult,
  RunHistoricalResearchFromBronzeInput,
} from "./runner";

export {
  BATCH_RESEARCH_OUTPUT_FILENAME,
  BatchResearchRunnerError,
  BatchResearchRunnerErrorCode,
  DATASET_REGISTRY_FILENAME,
  DEFAULT_BATCH_RESEARCH_OUTPUT_DIR,
  DEFAULT_BATCH_RESEARCH_REGISTRY_DIR,
  DEFAULT_BATCH_RESEARCH_SUMMARY_FILENAME,
  buildBatchResearchOutputPath,
  createNodeBatchResearchFilesystem,
  discoverResearchDatasetRegistryPaths,
  parseResearchDatasetSeriesRegistryJson,
  resolveBatchResearchSummaryPath,
  runBatchResearch,
  serializeBatchResearchSummary,
} from "./batchResearch";
export type {
  BatchResearchFilesystem,
  BatchResearchMarketResult,
  BatchResearchMarketStatus,
  BatchResearchRunnerDeps,
  BatchResearchSummary,
  RunBatchResearchInput,
  RunSingleBatchResearchFn,
  RunSingleBatchResearchInput,
} from "./batchResearch";

export {
  buildResearchComparisonExport,
  buildResearchRunExport,
  serializeResearchExportDocument,
  RESEARCH_EXPORT_TABLE_COLUMNS,
  ResearchExportError,
  ResearchExportErrorCode,
  ResearchExportType,
  summaryMetricsFromBacktest,
} from "./export";
export type {
  BuildResearchComparisonExportInput,
  BuildResearchRunExportInput,
  ResearchExportDocument,
  ResearchExportGeneratedMetadata,
  ResearchExportRankingRow,
  ResearchExportSummaryMetrics,
  ResearchExportTableColumn,
  ResearchExportTableRow,
} from "./export";

export {
  buildResearchDatasetRegistries,
  buildResearchDatasetRegistryFromDirectories,
  buildResearchDatasetRegistryOutputPaths,
  buildResearchFixtureSummary,
  parseLinkedImportMetadataJson,
  parseResearchFixtureJson,
  ResearchDatasetRegistryError,
  ResearchDatasetRegistryErrorCode,
  scanResearchFixtures,
  serializeResearchDatasetSeriesRegistry,
} from "./registry";
export type {
  BuildResearchDatasetRegistryInput,
  ResearchDatasetRegistryEntry,
  ResearchDatasetRegistryIo,
  ResearchDatasetSeriesRegistry,
  ScannedResearchFixture,
} from "./registry";

export {
  buildResearchAggregateSummaries,
  buildResearchAggregateSummariesFromDirectories,
  buildResearchAggregateOutputPaths,
  buildResearchAggregateSummary,
  computeDurationStatistics,
  computeMarketCounts,
  computePerformanceStatistics,
  parseResearchOutputJson,
  ResearchAggregateError,
  ResearchAggregateErrorCode,
  scanResearchOutputs,
  serializeResearchAggregateSummary,
} from "./aggregation";
export type {
  BuildResearchAggregateSummaryInput,
  ResearchAggregateIo,
  ResearchAggregatePerformanceStatistics,
  ResearchDurationStatistics,
  ResearchMarketResultSummary,
  ResearchSeriesAggregateSummary,
  ScannedResearchOutput,
} from "./aggregation";

export {
  buildStrategyLeaderboard,
  buildStrategyLeaderboardFromDirectories,
  discoverStrategyAggregateSummaries,
  mergeStrategyMarkets,
  parseAggregateSummaryJson,
  parseStrategyLeaderboardRankMetric,
  serializeStrategyLeaderboard,
  StrategyLeaderboardError,
  StrategyLeaderboardErrorCode,
  STRATEGY_LEADERBOARD_RANK_METRICS,
  DEFAULT_STRATEGY_LEADERBOARD_INPUT_DIR,
  DEFAULT_STRATEGY_LEADERBOARD_OUTPUT_PATH,
} from "./leaderboard";
export type {
  BuildStrategyLeaderboardInput,
  ParsedStrategyAggregateSummary,
  ScannedStrategyAggregateSummary,
  StrategyLeaderboard,
  StrategyLeaderboardEntry,
  StrategyLeaderboardIo,
  StrategyLeaderboardRankMetric,
} from "./leaderboard";

export {
  buildStrategySweepOutputPath,
  createNodeStrategySweepFilesystem,
  discoverStrategySweepRegistryPaths,
  parseStrategySweepSeriesRegistryJson,
  resolveStrategySweepSummaryPath,
  runStrategySweep,
  serializeStrategySweepSummary,
  StrategySweepError,
  StrategySweepErrorCode,
  DEFAULT_STRATEGY_SWEEP_OUTPUT_DIR,
  DEFAULT_STRATEGY_SWEEP_REGISTRY_DIR,
  SWEEP_OUTPUT_FILENAME,
  SWEEP_SUMMARY_FILENAME,
} from "./sweep";
export type {
  RunStrategySweepInput,
  StrategySweepFilesystem,
  StrategySweepJob,
  StrategySweepMarketEntry,
  StrategySweepRunResult,
  StrategySweepRunnerDeps,
  StrategySweepSummary,
  StrategySweepSeriesRegistryDocument,
} from "./sweep";
