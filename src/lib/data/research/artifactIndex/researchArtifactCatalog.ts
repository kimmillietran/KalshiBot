import { DEFAULT_BATCH_IMPORT_FAILURE_ANALYSIS_OUTPUT_PATH } from "@/lib/data/importJobs/batchImport/batchImportFailureAnalysisTypes";
import { DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_HYPOTHESIS_EVIDENCE_HTML_PATH } from "@/lib/data/research/hypothesisEvidence/hypothesisEvidenceTypes";
import {
  DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_HTML_PATH,
  DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH,
} from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import { DEFAULT_HYPOTHESIS_VALIDATION_HTML_PATH, DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import {
  DEFAULT_DERIVED_SETTLEMENT_SENSITIVITY_HTML_PATH,
  DEFAULT_DERIVED_SETTLEMENT_SENSITIVITY_OUTPUT_PATH,
  DEFAULT_HYPOTHESIS_REFINEMENTS_HTML_PATH,
  DEFAULT_HYPOTHESIS_REFINEMENTS_OUTPUT_PATH,
  DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HTML_PATH,
  DEFAULT_STRATEGY_SYNTHESIS_DEBUG_OUTPUT_PATH,
} from "@/lib/data/research/researchDiagnostics/researchDiagnosticsTypes";
import { DEFAULT_RESEARCH_PIPELINE_SUMMARY_PATH } from "@/lib/data/research/pipeline/researchPipelineTypes";
import { DEFAULT_DATA_HEALTH_OUTPUT_PATH } from "@/lib/data/research/dataHealth/dataHealthTypes";
import {
  AGGREGATE_SUMMARY_FILENAME,
  BATCH_IMPORT_SUMMARY_FILENAME,
  CALIBRATION_REPORT_FILENAME,
  RESEARCH_OUTPUT_FILENAME,
  SETTLEMENT_AUDIT_ARTIFACT,
} from "@/lib/data/research/dataHealth/dataHealthTypes";

import type {
  ResearchArtifactCatalogEntry,
  ResearchArtifactIndexConfig,
} from "./researchArtifactIndexTypes";

function fileEntry(
  artifactId: string,
  name: string,
  path: string,
  producingPipelineStep: string,
  upstreamArtifactIds: readonly string[] = [],
): ResearchArtifactCatalogEntry {
  return {
    artifactId,
    name,
    path,
    kind: "file",
    producingPipelineStep,
    upstreamArtifactIds,
  };
}

function directoryEntry(
  artifactId: string,
  name: string,
  path: string,
  producingPipelineStep: string,
  upstreamArtifactIds: readonly string[] = [],
): ResearchArtifactCatalogEntry {
  return {
    artifactId,
    name,
    path,
    kind: "directory",
    producingPipelineStep,
    upstreamArtifactIds,
  };
}

function collectionEntry(
  artifactId: string,
  name: string,
  rootPath: string,
  fileName: string,
  producingPipelineStep: string,
  upstreamArtifactIds: readonly string[] = [],
): ResearchArtifactCatalogEntry {
  return {
    artifactId,
    name,
    path: rootPath,
    kind: "file-collection",
    fileName,
    producingPipelineStep,
    upstreamArtifactIds,
  };
}

/** Builds the canonical research artifact catalog for index generation. */
export function buildResearchArtifactCatalog(
  config: ResearchArtifactIndexConfig,
): readonly ResearchArtifactCatalogEntry[] {
  const researchResults = config.researchResultsDir;
  const imports = config.importsDir;

  return [
    fileEntry(
      "discovery-result",
      "Discovery result",
      config.discoveryResultPath,
      "discover",
    ),
    directoryEntry(
      "import-configs",
      "Import configs",
      config.importConfigsDir,
      "import-configs",
      ["discovery-result"],
    ),
    directoryEntry(
      "imports",
      "Imported bronze datasets",
      imports,
      "import-batch",
      ["import-configs"],
    ),
    fileEntry(
      "batch-import-summary",
      "Batch import summary",
      `${imports}/${BATCH_IMPORT_SUMMARY_FILENAME}`,
      "import-batch",
      ["import-configs"],
    ),
    fileEntry(
      "import-failure-analysis",
      "Import failure analysis",
      DEFAULT_BATCH_IMPORT_FAILURE_ANALYSIS_OUTPUT_PATH,
      "analyze-failures",
      ["batch-import-summary"],
    ),
    directoryEntry(
      "fixtures",
      "Replay fixtures",
      config.fixturesDir,
      "fixtures",
      ["imports"],
    ),
    fileEntry(
      "batch-fixtures-summary",
      "Fixture batch summary",
      "batch-fixtures-summary.json",
      "fixtures",
      ["imports"],
    ),
    directoryEntry(
      "research-datasets",
      "Research dataset registry",
      config.registryDir,
      "registry",
      ["fixtures"],
    ),
    collectionEntry(
      "research-outputs",
      "Strategy replay outputs",
      researchResults,
      RESEARCH_OUTPUT_FILENAME,
      "sweep",
      ["research-datasets"],
    ),
    fileEntry(
      "sweep-summary",
      "Strategy sweep summary",
      `${researchResults}/sweep-summary.json`,
      "sweep",
      ["research-datasets"],
    ),
    collectionEntry(
      "aggregate-summaries",
      "Aggregate strategy summaries",
      researchResults,
      AGGREGATE_SUMMARY_FILENAME,
      "aggregate",
      ["research-outputs"],
    ),
    fileEntry(
      "strategy-leaderboard",
      "Strategy leaderboard",
      config.leaderboardPath,
      "leaderboard",
      ["aggregate-summaries"],
    ),
    collectionEntry(
      "calibration-reports",
      "Calibration reports",
      researchResults,
      CALIBRATION_REPORT_FILENAME,
      "calibration",
      ["research-outputs"],
    ),
    fileEntry(
      "research-report-html",
      "Research report HTML",
      config.reportHtmlPath,
      "report",
      ["strategy-leaderboard", "aggregate-summaries"],
    ),
    fileEntry(
      "lead-lag-analysis",
      "Lead-lag analysis",
      `${researchResults}/lead-lag-analysis.json`,
      "lead-lag",
      ["research-outputs"],
    ),
    fileEntry(
      "statistical-significance",
      "Statistical significance report",
      `${researchResults}/statistical-significance.json`,
      "significance",
      ["aggregate-summaries"],
    ),
    fileEntry(
      "power-analysis",
      "Power analysis report",
      `${researchResults}/power-analysis.json`,
      "power-analysis",
      ["aggregate-summaries"],
    ),
    fileEntry(
      "overfitting-diagnostics",
      "Overfitting diagnostics",
      `${researchResults}/overfitting-diagnostics.json`,
      "overfitting-diagnostics",
      ["aggregate-summaries"],
    ),
    fileEntry(
      "regime-tags",
      "Regime tags",
      `${researchResults}/regime-tags.json`,
      "regime-tags",
      ["research-outputs"],
    ),
    fileEntry(
      "mispricing-atlas",
      "Mispricing atlas",
      `${researchResults}/mispricing-atlas.json`,
      "mispricing-atlas",
      ["research-outputs"],
    ),
    fileEntry(
      "hypothesis-candidates",
      "Hypothesis candidates",
      DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
      "hypotheses",
      ["mispricing-atlas", "lead-lag-analysis", "statistical-significance"],
    ),
    fileEntry(
      "hypothesis-evidence-html",
      "Hypothesis evidence HTML",
      DEFAULT_HYPOTHESIS_EVIDENCE_HTML_PATH,
      "hypotheses",
      ["hypothesis-candidates"],
    ),
    fileEntry(
      "hypothesis-validation",
      "Hypothesis validation report",
      DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
      "hypothesis-validation",
      ["hypothesis-candidates", "mispricing-atlas"],
    ),
    fileEntry(
      "hypothesis-validation-html",
      "Hypothesis validation HTML",
      DEFAULT_HYPOTHESIS_VALIDATION_HTML_PATH,
      "hypothesis-validation",
      ["hypothesis-validation"],
    ),
    fileEntry(
      "hypothesis-failure-analysis",
      "Hypothesis failure analysis",
      DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH,
      "hypothesis-failure-analysis",
      ["hypothesis-validation", "hypothesis-candidates"],
    ),
    fileEntry(
      "hypothesis-failure-analysis-html",
      "Hypothesis failure analysis HTML",
      DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_HTML_PATH,
      "hypothesis-failure-analysis",
      ["hypothesis-failure-analysis"],
    ),
    fileEntry(
      "derived-settlement-sensitivity",
      "Derived settlement sensitivity",
      DEFAULT_DERIVED_SETTLEMENT_SENSITIVITY_OUTPUT_PATH,
      "derived-settlement-sensitivity",
      ["hypothesis-validation", "mispricing-atlas"],
    ),
    fileEntry(
      "derived-settlement-sensitivity-html",
      "Derived settlement sensitivity HTML",
      DEFAULT_DERIVED_SETTLEMENT_SENSITIVITY_HTML_PATH,
      "derived-settlement-sensitivity",
      ["derived-settlement-sensitivity"],
    ),
    fileEntry(
      "hypothesis-refinements",
      "Hypothesis refinements",
      DEFAULT_HYPOTHESIS_REFINEMENTS_OUTPUT_PATH,
      "hypothesis-refinements",
      ["hypothesis-failure-analysis", "hypothesis-validation"],
    ),
    fileEntry(
      "hypothesis-refinements-html",
      "Hypothesis refinements HTML",
      DEFAULT_HYPOTHESIS_REFINEMENTS_HTML_PATH,
      "hypothesis-refinements",
      ["hypothesis-refinements"],
    ),
    fileEntry(
      "strategy-synthesis-debug",
      "Strategy synthesis debug",
      DEFAULT_STRATEGY_SYNTHESIS_DEBUG_OUTPUT_PATH,
      "strategy-synthesis-debug",
      ["strategy-synthesis", "hypothesis-validation"],
    ),
    fileEntry(
      "strategy-synthesis-debug-html",
      "Strategy synthesis debug HTML",
      DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HTML_PATH,
      "strategy-synthesis-debug",
      ["strategy-synthesis-debug"],
    ),
    fileEntry(
      "settlement-audit",
      "Settlement audit",
      `${researchResults}/${SETTLEMENT_AUDIT_ARTIFACT}`,
      "settlement-audit",
      ["research-outputs"],
    ),
    fileEntry(
      "pipeline-summary",
      "Pipeline summary",
      DEFAULT_RESEARCH_PIPELINE_SUMMARY_PATH,
      "pipeline",
    ),
    fileEntry(
      "data-health",
      "Data health report",
      DEFAULT_DATA_HEALTH_OUTPUT_PATH,
      "data-health",
    ),
    fileEntry(
      "research-artifact-index",
      "Research artifact index",
      config.outputPath,
      "artifact-index",
    ),
  ];
}

export function buildDownstreamConsumerMap(
  catalog: readonly ResearchArtifactCatalogEntry[],
): ReadonlyMap<string, readonly string[]> {
  const consumers = new Map<string, Set<string>>();

  for (const entry of catalog) {
    for (const upstreamId of entry.upstreamArtifactIds) {
      const existing = consumers.get(upstreamId) ?? new Set<string>();
      existing.add(entry.artifactId);
      consumers.set(upstreamId, existing);
    }
  }

  return new Map(
    [...consumers.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([artifactId, downstream]) => [
        artifactId,
        [...downstream].sort((left, right) => left.localeCompare(right)),
      ]),
  );
}
