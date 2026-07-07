export const DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH =
  "data/research-results/hypothesis-failure-analysis.json";

export const DERIVED_SETTLEMENT_SENSITIVITY_FILENAME = "derived-settlement-sensitivity.json";
export const DEFAULT_DERIVED_SETTLEMENT_SENSITIVITY_OUTPUT_PATH =
  "data/research-results/derived-settlement-sensitivity.json";
export const DEFAULT_DERIVED_SETTLEMENT_SENSITIVITY_HTML_PATH =
  "data/reports/derived-settlement-sensitivity.html";

export const HYPOTHESIS_REFINEMENTS_FILENAME = "hypothesis-refinements.json";
export const DEFAULT_HYPOTHESIS_REFINEMENTS_OUTPUT_PATH =
  "data/research-results/hypothesis-refinements.json";
export const DEFAULT_HYPOTHESIS_REFINEMENTS_HTML_PATH =
  "data/reports/hypothesis-refinements.html";

export const STRATEGY_SYNTHESIS_DEBUG_FILENAME = "strategy-synthesis-debug.json";
export const DEFAULT_STRATEGY_SYNTHESIS_DEBUG_OUTPUT_PATH =
  "data/research-results/strategy-synthesis-debug.json";
export const DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HTML_PATH =
  "data/reports/strategy-synthesis-debug.html";

export type ResearchDiagnosticsInputPaths = {
  hypothesisFailureAnalysisPath: string;
  derivedSettlementSensitivityPath: string;
  hypothesisRefinementsPath: string;
  strategySynthesisDebugPath: string;
};

export const DEFAULT_RESEARCH_DIAGNOSTICS_INPUT_PATHS: ResearchDiagnosticsInputPaths = {
  hypothesisFailureAnalysisPath: DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH,
  derivedSettlementSensitivityPath: DEFAULT_DERIVED_SETTLEMENT_SENSITIVITY_OUTPUT_PATH,
  hypothesisRefinementsPath: DEFAULT_HYPOTHESIS_REFINEMENTS_OUTPUT_PATH,
  strategySynthesisDebugPath: DEFAULT_STRATEGY_SYNTHESIS_DEBUG_OUTPUT_PATH,
};

export type ResearchDiagnosticMetric = {
  label: string;
  value: string;
};

export type ResearchDiagnosticArtifactCard = {
  artifactId: string;
  label: string;
  jsonPath: string;
  htmlPath: string;
  present: boolean;
  generatedAt: string | null;
  metrics: readonly ResearchDiagnosticMetric[];
};

export type ResearchDiagnosticsSection = {
  availableCount: number;
  totalCount: number;
  nearPromisingHypothesisCount: number | null;
  highestRobustnessScore: number | null;
  derivedSensitiveHypothesisCount: number | null;
  refinementCandidateCount: number | null;
  strategySynthesisFunnelStatus: string | null;
  harnessCandidateCount: number | null;
  cards: readonly ResearchDiagnosticArtifactCard[];
};

export type ResearchDiagnosticsIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};
