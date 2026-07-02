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
  computeReplayPricingDiagnostics,
  parseReplayPricingDiagnosticsFromResearchOutput,
  serializeReplayPricingDiagnostics,
  summarizeReplayPricingDiagnostics,
  ReplayPricingDiagnosticWarningCode,
} from "./diagnostics";
export type {
  DecisionPriceSnapshot,
  ObservedYesPriceRange,
  ReplayPricingDiagnosticWarning,
  ReplayPricingDiagnostics,
  ReplayPricingDiagnosticsRunSummary,
  SourceKalshiCandlePriceClassification,
} from "./diagnostics";

export {
  discoverResearchOutputPaths,
  inspectResearchOutputDocument,
  serializeResearchOutputInspectionSummaries,
  serializeResearchOutputInspectionSummary,
  ResearchOutputInspectionError,
  ResearchOutputInspectionErrorCode,
} from "./inspect";
export type {
  ResearchOutputFillPreview,
  ResearchOutputInspectionFormat,
  ResearchOutputInspectionSummary,
  ResearchOutputRejectedIntentPreview,
} from "./inspect";

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

export {
  buildParameterSweepOutputPath,
  buildParameterSweepSetRootPath,
  DEFAULT_PARAMETER_SWEEP_OUTPUT_DIR,
  DEFAULT_PARAMETER_SWEEP_REGISTRY_DIR,
  formatParameterSetId,
  generateParameterSets,
  PARAMETER_SWEEP_SUMMARY_FILENAME,
  ParameterStrategySweepError,
  ParameterStrategySweepErrorCode,
  parseParameterSweepDefinitionJson,
  resolveParameterStrategySweepSummaryPath,
  runParameterStrategySweep,
  serializeParameterStrategySweepSummary,
  validateParameterSweepDefinition,
} from "./parameterSweep/index";
export type {
  ParameterSet,
  ParameterSetRunSummary,
  ParameterStrategySweepSummary,
  ParameterSweepDefinition,
  RunParameterStrategySweepInput,
} from "./parameterSweep/index";

export {
  buildCalibrationMarketKey,
  buildCalibrationReportOutputPath,
  buildCalibrationBins,
  buildProbabilityCalibrationReport,
  buildProbabilityCalibrationReportsFromDirectories,
  buildProbabilityCalibrationReportsFromScanned,
  buildReliabilityTable,
  computeBrierScore,
  computeCalibrationChannelMetrics,
  computeExpectedCalibrationError,
  computeLogLoss,
  extractCalibrationObservationsFromDocument,
  extractCalibrationObservationsFromScan,
  normalizeRootPath,
  parseCalibrationResearchDocument,
  scanCalibrationResearchOutputs,
  serializeProbabilityCalibrationReport,
  CALIBRATION_REPORT_FILENAME,
  CalibrationError,
  CalibrationErrorCode,
  DEFAULT_CALIBRATION_BIN_COUNT,
  DEFAULT_CALIBRATION_INPUT_DIR,
  DEFAULT_CALIBRATION_OUTPUT_DIR,
} from "./calibration";
export type {
  BuildProbabilityCalibrationReportInput,
  CalibrationBin,
  CalibrationChannelMetrics,
  CalibrationIo,
  CalibrationMarketSummary,
  CalibrationObservation,
  CalibrationReliabilityRow,
  CalibrationSampleCounts,
  CalibrationWarning,
  ParsedCalibrationResearchDocument,
  ProbabilityCalibrationReport,
  ScannedCalibrationResearchOutput,
} from "./calibration";

export {
  DEFAULT_WALK_FORWARD_OUTPUT_DIR,
  DEFAULT_WALK_FORWARD_REGISTRY_DIR,
  WALK_FORWARD_FOLDS_DIR,
  WALK_FORWARD_SUMMARY_FILENAME,
  WalkForwardSplitError,
  WalkForwardSplitErrorCode,
  buildWalkForwardFoldOutputPath,
  buildWalkForwardSplitRootPath,
  buildWalkForwardSummaryPath,
  createNodeWalkForwardSplitFilesystem,
  generateWalkForwardFolds,
  normalizeWalkForwardSplitDefinition,
  orderWalkForwardMarkets,
  parseWalkForwardSplitDefinitionJson,
  runWalkForwardSplit,
  serializeWalkForwardFold,
  serializeWalkForwardSplitSummary,
  validateWalkForwardSplitDefinition,
} from "./walkForwardEngine";
export type {
  RunWalkForwardSplitInput,
  WalkForwardFold,
  WalkForwardFoldMetadata,
  WalkForwardMarketRef,
  WalkForwardRegistryMarket,
  WalkForwardSplitDefinition,
  WalkForwardSplitFilesystem,
  WalkForwardSplitRunnerDeps,
  WalkForwardSplitSummary,
} from "./walkForwardEngine";

export {
  buildExperimentDirectoryPath,
  buildExperimentId,
  buildExperimentIdentityHash,
  buildExperimentRecordOutputPath,
  hashDatasetContent,
  hashFixtureContent,
  parseExperimentResearchDocument,
  registerExperiments,
  resolveCalibrationReportPath,
  resolveFixtureHash,
  resolveLeaderboardSnapshot,
  scanExperimentResearchOutputs,
  serializeExperimentRecord,
  DEFAULT_EXPERIMENT_FIXTURES_ROOT,
  DEFAULT_EXPERIMENT_RESEARCH_ROOT,
  DEFAULT_EXPERIMENTS_ROOT,
  EXPERIMENT_ID_PREFIX,
  EXPERIMENT_RECORD_FILENAME,
  ExperimentRegistryError,
  ExperimentRegistryErrorCode,
} from "./experiment-registry";
export type {
  ExperimentIdentityInput,
  ExperimentLeaderboardEntry,
  ExperimentLeaderboardSnapshot,
  ExperimentRecord,
  ExperimentRegistryIo,
  ParsedExperimentResearchDocument,
  RegisterExperimentsInput,
  RegisterExperimentsResult,
  ScannedExperimentResearchOutput,
} from "./experiment-registry";

export {
  DEFAULT_WALK_FORWARD_SWEEP_OUTPUT_DIR,
  DEFAULT_WALK_FORWARD_SPLIT_INPUT_DIR,
  WALK_FORWARD_SWEEP_OUTPUT_FILENAME,
  WALK_FORWARD_SWEEP_SUMMARY_FILENAME,
  WalkForwardSweepError,
  WalkForwardSweepErrorCode,
  buildWalkForwardSweepOutputPath,
  createNodeWalkForwardSweepFilesystem,
  discoverWalkForwardSplit,
  parseWalkForwardFoldJson,
  resolveWalkForwardSweepSummaryPath,
  runWalkForwardStrategySweep,
  serializeWalkForwardSweepSummary,
} from "./walkForwardSweep";
export type {
  RunWalkForwardStrategySweepInput,
  WalkForwardSweepDiscoveredFold,
  WalkForwardSweepDiscoveredSplit,
  WalkForwardSweepFilesystem,
  WalkForwardSweepJob,
  WalkForwardSweepRunResult,
  WalkForwardSweepRunnerDeps,
  WalkForwardSweepSummary,
} from "./walkForwardSweep";

export {
  STRATEGY_DECISION_TRACE_FILENAME,
  buildStrategyDecisionTraceEntry,
  buildStrategySweepDecisionTracePath,
  serializeStrategyDecisionTrace,
} from "./decisionTrace";
export type {
  StrategyDecisionTraceDocument,
  StrategyDecisionTraceEntry,
  StrategyDecisionTraceMetadata,
} from "./decisionTrace";
