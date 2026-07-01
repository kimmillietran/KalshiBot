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
