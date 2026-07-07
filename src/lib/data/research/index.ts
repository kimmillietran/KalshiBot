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
  buildResearchReportDocument,
  loadResearchReportInputs,
  parseCalibrationReportJson,
  parseStrategyLeaderboardJson,
  serializeResearchReportHtml,
  DEFAULT_RESEARCH_REPORT_INPUT_DIR,
  DEFAULT_RESEARCH_REPORT_LEADERBOARD_PATH,
  DEFAULT_RESEARCH_REPORT_OUTPUT_PATH,
  ResearchReportError,
  ResearchReportErrorCode,
} from "./reports";
export type {
  ResearchReportDocument,
  ResearchReportInputs,
  ResearchReportMarketHighlight,
  ResearchReportStrategySection,
} from "./reports";

export {
  buildMispricingAtlas,
  buildMispricingAtlasFromDirectories,
  extractMispricingObservationsFromResearchOutput,
  serializeMispricingAtlas,
  DEFAULT_MISPRICING_ATLAS_INPUT_DIR,
  DEFAULT_MISPRICING_ATLAS_OUTPUT_PATH,
  MISPRICING_ATLAS_FILENAME,
  MispricingAtlasError,
  MispricingAtlasErrorCode,
} from "./mispricingAtlas";
export type {
  MispricingAtlas,
  MispricingAtlasBucketSummary,
  MispricingAtlasWarning,
  MispricingObservation,
} from "./mispricingAtlas";

export {
  buildLeadLagAnalysis,
  buildLeadLagAnalysisFromDirectories,
  computeAggregateLeadLagMetrics,
  computeLeadLagMetricsForCandles,
  extractLeadLagCandlesFromResearchOutput,
  serializeLeadLagAnalysis,
  DEFAULT_LEAD_LAG_INPUT_DIR,
  DEFAULT_LEAD_LAG_MAX_LAG,
  DEFAULT_LEAD_LAG_OUTPUT_PATH,
  LEAD_LAG_ANALYSIS_FILENAME,
  LeadLagError,
  LeadLagErrorCode,
} from "./leadLag";
export type {
  LeadLagAnalysis,
  LeadLagCandlePoint,
  LeadLagDirection,
  LeadLagLagMetrics,
  LeadLagMarketSeries,
  LeadLagWarning,
} from "./leadLag";

export {
  buildDecisionTraceAttribution,
  buildDecisionTraceAttributionFromDirectories,
  serializeDecisionTraceAttributionReport,
  computeActionBuckets,
  discoverDecisionTraces,
  extractAttributionObservations,
  DEFAULT_DECISION_TRACE_ATTRIBUTION_INPUT_DIR,
  DEFAULT_DECISION_TRACE_ATTRIBUTION_OUTPUT_PATH,
  DECISION_TRACE_ATTRIBUTION_FILENAME,
  MIN_ATTRIBUTION_SAMPLE_SIZE,
  DecisionTraceAttributionError,
  DecisionTraceAttributionErrorCode,
} from "./decisionTraceAttribution";
export type {
  AttributionBucketSummary,
  AttributionObservation,
  AttributionSampleCounts,
  AttributionWarning,
  DecisionTraceAttributionIo,
  DecisionTraceAttributionReport,
  ScannedDecisionTrace,
} from "./decisionTraceAttribution";

export {
  buildDataHealthReport,
  buildDataHealthReportFromPaths,
  serializeDataHealthReport,
  computeRecommendations,
  computeStageStatuses,
  scanDataHealthInputs,
  DEFAULT_DATA_HEALTH_CONFIG,
  DEFAULT_DATA_HEALTH_OUTPUT_PATH,
  DATA_HEALTH_FILENAME,
} from "./dataHealth";
export type {
  DataHealthConfig,
  DataHealthIo,
  DataHealthRecommendation,
  DataHealthReport,
  DataHealthStageStatus,
  PipelineCoverage,
  ResearchCoverage,
  SettlementHealth,
} from "./dataHealth";

export {
  buildHistoricalCoveragePlan,
  buildHistoricalCoveragePlanFromPaths,
  buildCoverageImportRecommendations,
  computeCoverageSnapshot,
  loadCoveragePlannerArtifacts,
  scanCoverageMarketRecords,
  serializeHistoricalCoveragePlan,
  serializeHistoricalCoveragePlanHtml,
  DEFAULT_HISTORICAL_COVERAGE_PLAN_OUTPUT_PATH,
  DEFAULT_HISTORICAL_COVERAGE_PLAN_HTML_PATH,
  HISTORICAL_COVERAGE_PLAN_FILENAME,
} from "./coveragePlanner";
export type {
  CoverageImportRecommendation,
  CoverageSnapshot,
  HistoricalCoveragePlanConfig,
  HistoricalCoveragePlanReport,
} from "./coveragePlanner";

export {
  allocateExpansionBatchBudget,
  buildExpansionBatchPlan,
  buildExpansionBatchMonthCandidates,
  createExpansionBatchPlanConsumptionState,
  expansionBatchAllocationTotal,
  loadExpansionBatchPlannerInputs,
  loadExpansionImportMarketRecords,
  parseExpansionBatchPlanJson,
  scoreExpansionBatchMonthCandidates,
  serializeExpansionBatchPlan,
  serializeExpansionBatchPlanHtml,
  DEFAULT_EXPANSION_BATCH_PLAN_COVERAGE_AWARE_VALIDATION_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_COVERAGE_PLAN_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_DISCOVERY_RESULT_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_EXPANSION_CONFIG_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_EXPANSION_IMPORT_SUMMARY_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_HYPOTHESIS_VALIDATION_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_HTML_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_OUTPUT_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_SELECTION_STRATEGY,
  EXPANSION_BATCH_PLAN_FILENAME,
  EXPANSION_BATCH_PLAN_SELECTION_STRATEGIES,
  ExpansionBatchPlannerError,
  ExpansionBatchPlannerErrorCode,
} from "./expansionBatchPlanner";
export type {
  BuildExpansionBatchPlanInput,
  ExpansionBatchAllocation,
  ExpansionBatchMonthCandidate,
  ExpansionBatchPlan,
  ExpansionBatchPlanSelectionStrategy,
  ExpansionBatchPlannerConfig,
  ExpansionBatchPlannerInputPaths,
  ExpansionBatchPlannerIo,
  ScoredExpansionBatchMonthCandidate,
} from "./expansionBatchPlanner";

export {
  buildCoverageAwareValidationReport,
  buildCoverageAwareValidationReportFromInputs,
  buildDefaultCoverageAwareValidationInputPaths,
  classifyCoverageAwareValidation,
  loadCoverageAwareValidationInputs,
  serializeCoverageAwareValidationHtml,
  serializeCoverageAwareValidationReport,
  COVERAGE_AWARE_VALIDATION_FILENAME,
  CoverageAwareValidationError,
  DEFAULT_COVERAGE_AWARE_VALIDATION_HTML_PATH,
  DEFAULT_COVERAGE_AWARE_VALIDATION_OUTPUT_PATH,
  DEFAULT_HISTORICAL_COVERAGE_PLAN_PATH,
} from "./coverageAwareValidation";
export type {
  BuildCoverageAwareValidationReportInput,
  CoverageAwareValidationClassification,
  CoverageAwareValidationEntry,
  CoverageAwareValidationReport,
  HistoricalCoveragePlan,
  RecommendedImportWindow,
} from "./coverageAwareValidation";

export {
  analyzeHypothesisFailure,
  buildDefaultHypothesisFailureAnalysisInputPaths,
  buildHypothesisFailureAnalysisReport,
  classifyHypothesisPriorityCategory,
  computeHypothesisPriorityScore,
  loadHypothesisFailureAnalysisInputs,
  rankHypothesisFailureAnalyses,
  resolveRecommendedNextAction,
  serializeHypothesisFailureAnalysisHtml,
  serializeHypothesisFailureAnalysisReport,
  DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_HTML_PATH,
  DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH,
  HYPOTHESIS_FAILURE_ANALYSIS_FILENAME,
  HypothesisFailureAnalysisError,
} from "./hypothesisFailureAnalysis";
export type {
  BuildHypothesisFailureAnalysisReportInput,
  HypothesisFailureAnalysisEntry,
  HypothesisFailureAnalysisReport,
  HypothesisFailureReason,
  HypothesisFailureReasonCategory,
  HypothesisPriorityCategory,
  HypothesisRecommendedNextAction,
  HypothesisStabilityDiagnostics,
} from "./hypothesisFailureAnalysis";

export {
  analyzeDerivedSettlementSensitivity,
  buildDefaultDerivedSettlementSensitivityInputPaths,
  buildDerivedSettlementSensitivityReport,
  classifyDerivedSensitivityRecommendation,
  computeOfficialOnlyValidations,
  discoverDerivedSettlementMarketKeys,
  loadDerivedSettlementSensitivityComputation,
  serializeDerivedSettlementSensitivityHtml,
  serializeDerivedSettlementSensitivityReport,
  DEFAULT_DERIVED_SETTLEMENT_SENSITIVITY_HTML_PATH,
  DEFAULT_DERIVED_SETTLEMENT_SENSITIVITY_OUTPUT_PATH,
  DERIVED_SETTLEMENT_SENSITIVITY_FILENAME,
  DerivedSettlementSensitivityError,
} from "./derivedSettlementSensitivity";
export type {
  BuildDerivedSettlementSensitivityReportInput,
  DerivedSensitivityRecommendation,
  DerivedSettlementSensitivityEntry,
  DerivedSettlementSensitivityReport,
} from "./derivedSettlementSensitivity";

export {
  buildDefaultHypothesisRefinementInputPaths,
  buildHypothesisRefinementReport,
  generateHypothesisRefinements,
  loadHypothesisRefinementInputs,
  parseParentHypothesisId,
  serializeHypothesisRefinementReport,
  serializeHypothesisRefinementsHtml,
  DEFAULT_HYPOTHESIS_REFINEMENTS_HTML_PATH,
  DEFAULT_HYPOTHESIS_REFINEMENTS_OUTPUT_PATH,
  HYPOTHESIS_REFINEMENTS_FILENAME,
  HYPOTHESIS_REFINEMENT_DISCLAIMER,
  HypothesisRefinementError,
} from "./hypothesisRefinementGenerator";
export type {
  BuildHypothesisRefinementReportInput,
  HypothesisRefinementCandidate,
  HypothesisRefinementReport,
  HypothesisRefinementType,
} from "./hypothesisRefinementGenerator";

export {
  buildStrategySynthesisDebugReport,
  loadStrategySynthesisDebugInputs,
  serializeStrategySynthesisDebugHtml,
  serializeStrategySynthesisDebugReport,
  DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HTML_PATH,
  DEFAULT_STRATEGY_SYNTHESIS_DEBUG_OUTPUT_PATH,
  STRATEGY_SYNTHESIS_DEBUG_FILENAME,
  StrategySynthesisDebugError,
} from "./strategySynthesisDebug";
export type {
  BuildStrategySynthesisDebugReportInput,
  StrategySynthesisDebugReport,
  StrategySynthesisFunnelCounts,
  StrategySynthesisDiagnosis,
} from "./strategySynthesisDebug";

export {
  analyzeMonthRegimeStability,
  buildMonthRegimeAnalysisReport,
  buildMonthRegimeObservationIndex,
  loadMonthRegimeAnalysisInputs,
  serializeMonthRegimeAnalysisHtml,
  serializeMonthRegimeAnalysisReport,
  DEFAULT_MONTH_REGIME_ANALYSIS_HTML_PATH,
  DEFAULT_MONTH_REGIME_ANALYSIS_OUTPUT_PATH,
  MONTH_REGIME_ANALYSIS_FILENAME,
  MonthRegimeAnalysisError,
} from "./monthRegimeAnalysis";
export type {
  BuildMonthRegimeAnalysisReportInput,
  MonthRegimeAnalysisReport,
  MonthRegimeHypothesisAnalysis,
} from "./monthRegimeAnalysis";

export {
  buildStatisticalSignificanceFromDirectories,
  buildStatisticalSignificanceReport,
  bootstrapMeanConfidenceInterval,
  bootstrapWinRateConfidenceInterval,
  computeStrategyStatisticalSignificance,
  extractCompletedMarketSamples,
  resolveStatisticalSignificanceConfig,
  serializeStatisticalSignificanceReport,
  toLeaderboardSignificanceFields,
  DEFAULT_BOOTSTRAP_SEED,
  DEFAULT_BOOTSTRAP_SIMULATION_COUNT,
  DEFAULT_CONFIDENCE_LEVEL,
  DEFAULT_SIGNIFICANCE_ALPHA,
  DEFAULT_STATISTICAL_SIGNIFICANCE_INPUT_DIR,
  DEFAULT_STATISTICAL_SIGNIFICANCE_OUTPUT_PATH,
  STATISTICAL_SIGNIFICANCE_FILENAME,
} from "./statisticalSignificance";
export type {
  BuildStatisticalSignificanceReportInput,
  CompletedMarketSample,
  ConfidenceInterval,
  StatisticalSignificanceConfig,
  StatisticalSignificanceIo,
  StatisticalSignificanceReport,
  StrategyConfidenceIntervals95,
  StrategyStatisticalSignificanceMetrics,
} from "./statisticalSignificance";

export {
  buildRegimeTagsReport,
  buildRegimeTagsReportFromDirectories,
  classifyMarketState,
  classifyTrendRegime,
  classifyVolatilityRegime,
  computeRegimeMarketEntry,
  extractRegimeStepsFromResearchOutput,
  serializeRegimeTagsReport,
  DEFAULT_REGIME_TAGGING_INPUT_DIR,
  DEFAULT_REGIME_TAGGING_OUTPUT_PATH,
  DEFAULT_REGIME_VOLATILITY_LOOKBACK_BARS,
  REGIME_TAGS_FILENAME,
  RegimeTaggingError,
  RegimeTaggingErrorCode,
} from "./regimeTagging";
export type {
  BuildRegimeTagsReportInput,
  MarketStateRegimeTag,
  RegimeMarketEntry,
  RegimeMarketMetrics,
  RegimeMarketTags,
  RegimeStepPoint,
  RegimeSummaryCounts,
  RegimeTaggingIo,
  RegimeTaggingSampleCounts,
  RegimeTaggingWarning,
  RegimeTagsReport,
  RegimeTimeRemainingProfile,
  TrendRegimeTag,
  VolatilityRegimeTag,
} from "./regimeTagging";

export {
  buildVolPremiumStudy,
  buildVolPremiumStudyFromDirectories,
  computeMoneynessVolPremiumBuckets,
  computeOverallVolPremiumSummary,
  computeVolPremium,
  estimateImpliedVolatility,
  estimateForwardRealizedVolatility,
  extractVolPremiumObservationsFromResearchOutput,
  loadOptionalRegimeTagsIndex,
  serializeVolPremiumStudy,
  DEFAULT_VOL_PREMIUM_INPUT_DIR,
  DEFAULT_VOL_PREMIUM_OUTPUT_PATH,
  DEFAULT_VOL_PREMIUM_VOLATILITY_LOOKBACK_BARS,
  ImpliedVolatilityInversionCode,
  VOL_PREMIUM_STUDY_FILENAME,
  VolPremiumError,
  VolPremiumErrorCode,
} from "./volPremium";
export type {
  BuildVolPremiumStudyInput,
  VolPremiumBucketSummary,
  VolPremiumIo,
  VolPremiumMarketSummary,
  VolPremiumObservation,
  VolPremiumOverallSummary,
  VolPremiumSampleCounts,
  VolPremiumStudy,
  VolPremiumWarning,
} from "./volPremium";

export {
  assignStepToEventWindow,
  buildEventStudyReport,
  buildEventStudyReportFromDirectories,
  computeEventStudyEventResult,
  extractEventStudyMarketFromResearchOutput,
  filterStepsForEventWindow,
  marketOverlapsEventStudySpan,
  parseEventsJson,
  readEventsFile,
  resolveEventStudyWindowConfig,
  serializeEventStudyReport,
  DEFAULT_EVENT_AFTER_WINDOW_MS,
  DEFAULT_EVENT_BEFORE_WINDOW_MS,
  DEFAULT_EVENT_DURING_WINDOW_MS,
  DEFAULT_EVENT_STUDY_INPUT_DIR,
  DEFAULT_EVENT_STUDY_OUTPUT_PATH,
  DEFAULT_EVENTS_FILE_PATH,
  EVENT_STUDY_FILENAME,
  EventStudyError,
  EventStudyErrorCode,
} from "./eventStudy";
export type {
  BuildEventStudyReportInput,
  EventDefinition,
  EventStudyEventResult,
  EventStudyIo,
  EventStudyMarketData,
  EventStudyMarketWindowResult,
  EventStudyReport,
  EventStudySampleCounts,
  EventStudyShiftMetrics,
  EventStudyStepPoint,
  EventStudyWarning,
  EventStudyWindowConfig,
  EventStudyWindowMetrics,
  EventStudyWindowName,
} from "./eventStudy";

export {
  buildHypothesisCandidates,
  buildHypothesisCandidateInputStatus,
  buildAtlasCandidate,
  loadHypothesisCandidateInputs,
  selectLeadLagSignal,
  serializeHypothesisCandidatesReport,
  DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
  DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE,
  DEFAULT_LEAD_LAG_INPUT_PATH,
  DEFAULT_MIN_CALIBRATION_ERROR,
  DEFAULT_MIN_LEAD_LAG_CORRELATION,
  DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
  DEFAULT_REGIME_TAGS_INPUT_PATH,
  DEFAULT_STATISTICAL_SIGNIFICANCE_INPUT_PATH,
  DEFAULT_STRATEGY_LEADERBOARD_INPUT_PATH,
  HYPOTHESIS_CANDIDATES_FILENAME,
  HypothesisCandidateError,
  HypothesisCandidateErrorCode,
} from "./hypothesisCandidates";
export type {
  BuildHypothesisCandidatesInput,
  HypothesisCandidate,
  HypothesisCandidateConfig,
  HypothesisCandidateInputStatus,
  HypothesisCandidateIo,
  HypothesisCandidatesReport,
  HypothesisCandidatesSummary,
  HypothesisConfidence,
  ParsedHypothesisCandidateInputs,
  RegimeTagEntry,
  RegimeTagsDocument,
} from "./hypothesisCandidates";

export {
  buildHypothesisEvidenceReport,
  buildHypothesisConfidenceSummary,
  collectHypothesisExampleMarkets,
  hasStatisticallySignificantStrategy,
  parseAtlasCandidateReference,
  parseLeadLagCandidateReference,
  serializeHypothesisEvidenceHtml,
  DEFAULT_HYPOTHESIS_EVIDENCE_HTML_PATH,
} from "./hypothesisEvidence";
export type {
  BuildHypothesisEvidenceReportInput,
  HypothesisEvidenceCard,
  HypothesisEvidenceReport,
  HypothesisExampleMarket,
} from "./hypothesisEvidence";

export {
  assertHypothesisValidationInputFiles,
  buildHypothesisValidationReport,
  buildHypothesisValidationReportFromInputs,
  buildDefaultHypothesisValidationInputPaths,
  collectEnrichedMispricingObservations,
  computeRobustnessScore,
  computeSignedCalibrationError,
  computeTimeStabilityMetrics,
  filterObservationsForAtlasBucket,
  loadHypothesisCandidatesFromFile,
  parseAtlasHypothesisCandidateId,
  serializeHypothesisValidationHtml,
  serializeHypothesisValidationReport,
  DEFAULT_HYPOTHESIS_VALIDATION_HTML_PATH,
  DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
  DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE,
  HypothesisRobustnessError,
} from "./hypothesisRobustness";
export type {
  BuildHypothesisValidationReportInput,
  EnrichedMispricingObservation,
  HypothesisRobustnessIo,
  HypothesisValidationEntry,
  HypothesisValidationReport,
} from "./hypothesisRobustness";

export {
  buildPipelineDashboardReport,
  buildPipelineDashboardReportFromInputs,
  loadPipelineDashboardInputs,
  serializePipelineDashboardHtml,
  DEFAULT_HARNESS_RESULTS_PATH,
  DEFAULT_HARNESS_SUMMARY_FALLBACK_PATH,
  DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
  DEFAULT_RESEARCH_ARTIFACT_INDEX_PATH,
  DEFAULT_RESEARCH_DASHBOARD_HTML_PATH,
  PipelineDashboardError,
} from "./pipelineDashboard";
export type {
  ArtifactHealthEntry,
  ArtifactHealthSection,
  BuildPipelineDashboardReportInput,
  HypothesisSummarySection,
  ParsedPipelineDashboardInputs,
  PipelineDashboardInputPaths,
  PipelineDashboardIo,
  PipelineDashboardReport,
  PipelineStatusSection,
  ResearchHealthSection,
  StrategySummarySection,
} from "./pipelineDashboard";

export {
  buildResearchPerformanceAudit,
  loadPerformanceAuditInputs,
  parseResearchPerformanceAuditConfigFromArgv,
  serializeResearchPerformanceAudit,
  serializeResearchPerformanceAuditHtml,
  buildPipelineStepResourceProfiles,
  computeCriticalPath,
  findParallelExecutionGroups,
  estimateParallelRuntimeMs,
  DEFAULT_RESEARCH_PERFORMANCE_AUDIT_OUTPUT_PATH,
  DEFAULT_RESEARCH_PERFORMANCE_AUDIT_HTML_PATH,
  DEFAULT_PERFORMANCE_AUDIT_FULL_RESEARCH_SUMMARY_PATH,
  PerformanceAuditError,
} from "./performanceAudit";
export type {
  BuildResearchPerformanceAuditInput,
  PerformanceAuditConfig,
  PerformanceAuditReport,
  PerformanceAuditStepReport,
  OptimizationOpportunity,
  CriticalPathAnalysis,
} from "./performanceAudit";

export {
  buildExpansionImportPerformanceAudit,
  loadExpansionImportPerformanceAuditInputs,
  parseExpansionImportPerformanceAuditConfigFromArgv,
  serializeExpansionImportPerformanceAudit,
  serializeExpansionImportPerformanceAuditHtml,
  DEFAULT_EXPANSION_IMPORT_PERFORMANCE_AUDIT_OUTPUT_PATH,
  DEFAULT_EXPANSION_IMPORT_PERFORMANCE_AUDIT_HTML_PATH,
  ExpansionImportPerformanceAuditError,
} from "./expansionImportPerformanceAudit";
export type {
  BuildExpansionImportPerformanceAuditInput,
  ExpansionImportPerformanceAuditConfig,
  ExpansionImportPerformanceAuditReport,
  ExpansionImportPerformanceRecommendations,
} from "./expansionImportPerformanceAudit";

export {
  buildExpansionRunHistoryReport,
  buildExpansionRunHistoryRun,
  analyzeExpansionRunHistory,
  loadExpansionRunHistoryInputs,
  parseExpansionRunHistoryPathsFromArgv,
  serializeExpansionRunHistoryHtml,
  appendExpansionRunHistoryRun,
  pruneExpansionRunHistoryRuns,
  tryLoadExpansionRunHistoryDocument,
  DEFAULT_EXPANSION_RUN_HISTORY_OUTPUT_PATH,
  DEFAULT_EXPANSION_RUN_HISTORY_HTML_PATH,
  DEFAULT_EXPANSION_RUN_HISTORY_MAX_RUNS,
  ExpansionRunHistoryError,
} from "./expansionRunHistory";
export type {
  ExpansionRunHistoryDocument,
  ExpansionRunHistoryHighlights,
  ExpansionRunHistoryInputPaths,
  ExpansionRunHistoryIo,
  ExpansionRunHistoryReport,
  ExpansionRunHistoryRun,
  ExpansionRunHistoryTrends,
} from "./expansionRunHistory";

export {
  buildResearchDiagnosticsSection,
  loadResearchDiagnosticsInputs,
  DEFAULT_RESEARCH_DIAGNOSTICS_INPUT_PATHS,
} from "./researchDiagnostics";
export type {
  ResearchDiagnosticArtifactCard,
  ResearchDiagnosticsSection,
} from "./researchDiagnostics";

export {
  buildHypothesisLifecycleReport,
  buildHypothesisLifecycleReportFromInputs,
  loadHypothesisLifecycleInputs,
  serializeHypothesisLifecycleHtml,
  DEFAULT_HYPOTHESIS_LIFECYCLE_HTML_PATH,
  DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS,
  HYPOTHESIS_LIFECYCLE_STAGE_ORDER,
  HypothesisLifecycleError,
} from "./hypothesisLifecycle";
export type {
  BuildHypothesisLifecycleReportInput,
  HypothesisLifecycleEntry,
  HypothesisLifecycleInputPaths,
  HypothesisLifecycleIo,
  HypothesisLifecycleReport,
  HypothesisLifecycleStageId,
  HypothesisLifecycleStageState,
  HypothesisLifecycleStageStatus,
  HypothesisLifecycleSummary,
  HypothesisLifecycleTimestamps,
  HypothesisPipelineStatus,
  HypothesisPromotionDecision,
  HypothesisValidationOutcome,
  ParsedHypothesisLifecycleInputs,
} from "./hypothesisLifecycle";

export {
  buildHypothesisEvolutionReport,
  buildHypothesisEvolutionRun,
  analyzeHypothesisEvolution,
  loadHypothesisEvolutionInputs,
  serializeHypothesisEvolutionHtml,
  appendHypothesisHistoryRun,
  parseHypothesisHistoryDocument,
  pruneHypothesisHistoryRuns,
  serializeHypothesisHistoryDocument,
  tryLoadHypothesisHistoryDocument,
  DEFAULT_HYPOTHESIS_EVOLUTION_HTML_PATH,
  DEFAULT_HYPOTHESIS_HISTORY_MAX_RUNS,
  DEFAULT_HYPOTHESIS_HISTORY_OUTPUT_PATH,
  HypothesisEvolutionError,
} from "./hypothesisEvolution";
export type {
  HypothesisEvolutionDashboardHighlights,
  HypothesisEvolutionEntry,
  HypothesisEvolutionInputPaths,
  HypothesisEvolutionIo,
  HypothesisEvolutionReport,
  HypothesisEvolutionRunSnapshot,
  HypothesisEvolutionSummary,
  HypothesisEvolutionTrend,
  HypothesisEvolutionTrendMetrics,
  HypothesisEvolutionValidationEntry,
  HypothesisHistoryDocument,
  HypothesisHistoryRun,
} from "./hypothesisEvolution";

export {
  buildStrategySynthesisReport,
  derivePromotionStatus,
  deriveStrategyDirection,
  loadStrategySynthesisInputs,
  serializeStrategySynthesisReport,
  DEFAULT_STRATEGY_SYNTHESIS_OUTPUT_PATH,
  STRATEGY_SYNTHESIS_CANDIDATES_FILENAME,
  StrategySynthesisError,
  StrategySynthesisErrorCode,
} from "./strategySynthesis";
export type {
  BuildStrategySynthesisReportInput,
  StrategyPromotionStatus,
  StrategySynthesisCandidate,
  StrategySynthesisCandidatesReport,
  StrategySynthesisDirection,
  StrategySynthesisEntryConditions,
} from "./strategySynthesis";

export {
  buildStrategyHarnessOutputPath,
  createResearchStrategyHarnessRegistry,
  filterHarnessStrategySpecs,
  HARNESS_DEFAULT_PROMOTION_STATUSES,
  HARNESS_NO_MATCH_WARNING,
  loadHarnessStrategySpecs,
  loadStrategySynthesisCandidatesReport,
  resolveHarnessStrategyFromSpec,
  resolveHarnessStrategySpecs,
  resolveTranslatedHarnessStrategy,
  runStrategyHarness,
  serializeStrategyHarnessSummary,
  translateSynthesizedStrategySpec,
  CALIBRATION_FADE_STRATEGY_ID,
  DEFAULT_STRATEGY_HARNESS_OUTPUT_DIR,
  DEFAULT_STRATEGY_SYNTHESIS_CANDIDATES_PATH,
  SUPPORTED_STRATEGY_HARNESS_FAMILIES,
  StrategyHarnessError,
} from "./strategyHarness";
export type {
  RunStrategyHarnessEvaluationFn,
  RunStrategyHarnessEvaluationInput,
  RunStrategyHarnessInput,
  StrategyHarnessIo,
  StrategyHarnessMarketResult,
  StrategyHarnessSummary,
  SynthesizedStrategySpec,
  TranslatedHarnessStrategy,
} from "./strategyHarness";

export {
  buildHarnessResultsReport,
  deriveHarnessPromotionRecommendation,
  loadHarnessResultsInputs,
  serializeHarnessResultsHtml,
  serializeHarnessResultsReport,
  DEFAULT_HARNESS_RESULTS_HTML_PATH,
  DEFAULT_HARNESS_RESULTS_OUTPUT_PATH,
  HarnessResultsError,
  HarnessResultsErrorCode,
} from "./harnessResults";
export type {
  BuildHarnessResultsReportInput,
  HarnessPromotionRecommendation,
  HarnessResultsReport,
  HarnessStrategyResult,
} from "./harnessResults";

export {
  buildCandidatePromotionReport,
  classifyAllCandidatePromotions,
  classifyCandidatePromotion,
  loadCandidatePromotionInputs,
  serializeCandidatePromotionHtml,
  serializeCandidatePromotionReport,
  DEFAULT_CANDIDATE_PROMOTIONS_HTML_PATH,
  DEFAULT_CANDIDATE_PROMOTIONS_OUTPUT_PATH,
  CandidatePromotionError,
} from "./candidatePromotion";
export type {
  BuildCandidatePromotionReportInput,
  CandidatePromotionDecision,
  CandidatePromotionEntry,
  CandidatePromotionReport,
  CandidatePromotionSupportingMetrics,
} from "./candidatePromotion";

export {
  buildResearchCandidateRegistryReport,
  buildResearchCandidateRegistryReportFromInputs,
  loadExistingResearchCandidateRegistry,
  loadResearchCandidateRegistryInputs,
  serializeResearchCandidateRegistryHtml,
  serializeResearchCandidateRegistryReport,
  DEFAULT_RESEARCH_CANDIDATE_REGISTRY_HTML_PATH,
  DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS,
  DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH,
  RESEARCH_CANDIDATE_REGISTRY_FILENAME,
  ResearchCandidateRegistryError,
} from "./candidateRegistry";
export type {
  BuildResearchCandidateRegistryInput,
  ResearchCandidateRegistryEntry,
  ResearchCandidateRegistryReport,
  ResearchCandidateStatus,
} from "./candidateRegistry";

export {
  buildExperimentRecord,
  buildResearchExperimentId,
  buildResearchExperimentRecordPath,
  compareExperimentPair,
  loadExperimentInputs,
  parseExperimentManagerConfigFromArgv,
  registerResearchExperiment,
  serializeExperimentIndex,
  serializeExperimentManagerHtml,
  DEFAULT_RESEARCH_EXPERIMENT_INDEX_PATH,
  DEFAULT_RESEARCH_EXPERIMENT_INPUT_PATHS,
  DEFAULT_RESEARCH_EXPERIMENTS_DIR,
  DEFAULT_RESEARCH_EXPERIMENTS_HTML_PATH,
  RESEARCH_EXPERIMENT_ID_PREFIX,
  ResearchExperimentManagerError,
  ResearchExperimentManagerErrorCode,
} from "./experimentManager";
export type {
  ExperimentPairComparison,
  RegisterResearchExperimentResult,
  ResearchExperimentIndex,
  ResearchExperimentRecord,
} from "./experimentManager";

export {
  buildCrossValidationReport,
  buildCrossValidationReportFromInputs,
  buildDefaultCrossValidationInputPaths,
  computeAllCrossValidationMethods,
  serializeCrossValidationHtml,
  serializeCrossValidationReport,
  CROSS_VALIDATION_FILENAME,
  CROSS_VALIDATION_METHOD_IDS,
  CrossValidationError,
  DEFAULT_CROSS_VALIDATION_HTML_PATH,
  DEFAULT_CROSS_VALIDATION_OUTPUT_PATH,
} from "./crossValidation";
export type {
  BuildCrossValidationReportInput,
  CrossValidationConfig,
  CrossValidationEntry,
  CrossValidationMethodId,
  CrossValidationMethodResult,
  CrossValidationReport,
} from "./crossValidation";

export {
  buildPowerAnalysisReport,
  buildPowerAnalysisReportFromDirectories,
  computeMinimumDetectableEffect,
  computeRequiredSampleSize,
  computeStrategyPowerAnalysis,
  serializePowerAnalysisReport,
  DEFAULT_POWER_ANALYSIS_ALPHA,
  DEFAULT_POWER_ANALYSIS_INPUT_DIR,
  DEFAULT_POWER_ANALYSIS_LEVELS,
  DEFAULT_POWER_ANALYSIS_OUTPUT_PATH,
  DEFAULT_TARGET_EDGE_CENTS,
  POWER_ANALYSIS_FILENAME,
  PowerAnalysisError,
  PowerAnalysisErrorCode,
} from "./powerAnalysis";
export type {
  PowerAnalysisOverallSummary,
  PowerAnalysisReport,
  PowerTableRow,
  StrategyPowerAnalysis,
} from "./powerAnalysis";

export {
  buildOverfittingDiagnosticsFromDirectories,
  buildOverfittingDiagnosticsReport,
  buildMultipleTestingDiagnostics,
  computeBenjaminiHochbergFdr,
  computeFamilyWiseAdjustedPValues,
  computePboFromFoldMatrix,
  discoverExperimentRegistry,
  serializeOverfittingDiagnosticsReport,
  DEFAULT_MULTIPLE_TESTING_ALPHA,
  DEFAULT_OVERFITTING_DIAGNOSTICS_EXPERIMENTS_ROOT,
  DEFAULT_OVERFITTING_DIAGNOSTICS_INPUT_DIR,
  DEFAULT_OVERFITTING_DIAGNOSTICS_OUTPUT_PATH,
  OVERFITTING_DIAGNOSTICS_FILENAME,
} from "./overfittingDiagnostics";
export type {
  BacktestOverfittingDiagnostic,
  BuildOverfittingDiagnosticsReportInput,
  DeflatedSharpeDiagnostic,
  EvaluationScope,
  ExperimentRegistryDiagnostics,
  FamilyWiseAdjustedPValue,
  FdrAdjustedPValue,
  FoldPerformanceMatrix,
  MetricAvailability,
  MultipleTestingDiagnostics,
  OverfittingDiagnosticsIo,
  OverfittingDiagnosticsReport,
  StrategyFamilyDiagnostics,
} from "./overfittingDiagnostics";

export {
  buildResearchPipelineSteps,
  formatResearchPipelineCommand,
  parseResearchPipelineConfigFromArgv,
  runResearchPipeline,
  serializeResearchPipelineSummary,
  DEFAULT_DISCOVERY_OUTPUT_PATH,
  DEFAULT_RESEARCH_PIPELINE_CONCURRENCY,
  DEFAULT_RESEARCH_PIPELINE_LIMIT,
  DEFAULT_RESEARCH_PIPELINE_SERIES,
  DEFAULT_RESEARCH_PIPELINE_SUMMARY_PATH,
  RESEARCH_PIPELINE_SUMMARY_FILENAME,
  ResearchPipelineError,
  ResearchPipelineErrorCode,
} from "./pipeline";
export type {
  ResearchPipelineConfig,
  ResearchPipelineRunStatus,
  ResearchPipelineRunner,
  ResearchPipelineRunnerResult,
  ResearchPipelineStepDefinition,
  ResearchPipelineStepResult,
  ResearchPipelineStepStatus,
  ResearchPipelineSummary,
  RunResearchPipelineInput,
  RunResearchPipelineOutput,
} from "./pipeline";

export {
  buildFullResearchSteps,
  createDefaultFullResearchOrchestratorConfig,
  parseFullResearchOrchestratorConfigFromArgv,
  runFullResearchOrchestrator,
  serializeFullResearchSummary,
  DEFAULT_FULL_RESEARCH_SUMMARY_PATH,
  FULL_RESEARCH_SUMMARY_FILENAME,
  FullResearchOrchestratorError,
  FullResearchOrchestratorErrorCode,
} from "./fullOrchestrator";
export type {
  FullResearchOrchestratorConfig,
  FullResearchOutputIo,
  FullResearchRunStatus,
  FullResearchStepDefinition,
  FullResearchStepResult,
  FullResearchStepStatus,
  FullResearchSummary,
  RunFullResearchOrchestratorInput,
  RunFullResearchOrchestratorOutput,
} from "./fullOrchestrator";

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
  StrategyLeaderboardConfidenceInterval,
  StrategyLeaderboardConfidenceIntervals95,
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

export {
  collectExpansionRebuildMetrics,
  DEFAULT_EXPANSION_FIXTURES_DIR,
  DEFAULT_EXPANSION_IMPORT_CONFIGS_DIR,
  DEFAULT_EXPANSION_IMPORTS_DIR,
  DEFAULT_EXPANSION_MISPRICING_ATLAS_PATH,
  DEFAULT_EXPANSION_REGISTRY_DIR,
  DEFAULT_EXPANSION_REBUILD_SUMMARY_HTML_PATH,
  DEFAULT_EXPANSION_REBUILD_SUMMARY_PATH,
  DEFAULT_EXPANSION_RESEARCH_RESULTS_DIR,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH,
  ExpansionRebuildError,
  ExpansionRebuildErrorCode,
  extractImportedExpansionMarkets,
  loadHistoricalExpansionImportSummary,
  parseHistoricalExpansionImportSummaryJson,
  runExpansionRebuild,
  serializeExpansionRebuildSummary,
  serializeExpansionRebuildSummaryHtml,
} from "./expansionRebuild";
export type {
  ExpansionRebuildFixtureMarketResult,
  ExpansionRebuildIo,
  ExpansionRebuildMarketStatus,
  ExpansionRebuildMetrics,
  ExpansionRebuildResearchMarketResult,
  ExpansionRebuildSummary,
  ExpansionRebuildTargetMarket,
  HistoricalExpansionImportSummary,
  RunExpansionRebuildDeps,
  RunExpansionRebuildInput,
} from "./expansionRebuild";
