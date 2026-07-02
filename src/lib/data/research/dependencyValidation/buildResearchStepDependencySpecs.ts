import { DEFAULT_BATCH_IMPORT_FAILURE_ANALYSIS_INPUT_PATH } from "@/lib/data/importJobs/batchImport/batchImportFailureAnalysisTypes";
import { RESEARCH_OUTPUT_FILENAME } from "@/lib/data/research/aggregation/researchAggregatePaths";
import { AGGREGATE_SUMMARY_FILENAME } from "@/lib/data/research/aggregation/researchAggregatePaths";
import { DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import {
  DEFAULT_LEAD_LAG_INPUT_PATH,
  DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
  DEFAULT_REGIME_TAGS_INPUT_PATH,
  DEFAULT_STATISTICAL_SIGNIFICANCE_INPUT_PATH,
  DEFAULT_STRATEGY_LEADERBOARD_INPUT_PATH,
} from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_STRATEGY_LEADERBOARD_OUTPUT_PATH } from "@/lib/data/research/leaderboard/strategyLeaderboardTypes";
import { DEFAULT_RESEARCH_REPORT_OUTPUT_PATH } from "@/lib/data/research/reports/researchReportTypes";

import type {
  BuildResearchStepDependencySpecsInput,
  DependencyArtifactSpec,
  ResearchStepDependencySpec,
} from "./researchDependencyTypes";

const RESEARCH_RESULTS_ROOT = "data/research-results";

function file(
  id: string,
  label: string,
  path: string,
  requirement: DependencyArtifactSpec["requirement"] = "required",
): DependencyArtifactSpec {
  return { id, label, path, requirement, kind: "file" };
}

function directory(
  id: string,
  label: string,
  path: string,
  requirement: DependencyArtifactSpec["requirement"] = "required",
): DependencyArtifactSpec {
  return { id, label, path, requirement, kind: "directory-non-empty" };
}

function filesNamedUnder(
  id: string,
  label: string,
  root: string,
  fileName: string,
  minCount: number,
  requirement: DependencyArtifactSpec["requirement"] = "required",
): DependencyArtifactSpec {
  return {
    id,
    label,
    path: root,
    requirement,
    kind: "file-named-under",
    fileName,
    minCount,
  };
}

/** Builds deterministic dependency specs for each official pipeline step. */
export function buildResearchStepDependencySpecs(
  input: BuildResearchStepDependencySpecsInput,
): ReadonlyMap<string, ResearchStepDependencySpec> {
  const specs: ResearchStepDependencySpec[] = [
    {
      stepId: "discover",
      requiredArtifacts: [],
      optionalArtifacts: [],
    },
    {
      stepId: "import-configs",
      requiredArtifacts: [
        file("discovery-result", "Discovery result", input.discoveryOutputPath),
      ],
      optionalArtifacts: [],
    },
    {
      stepId: "import-batch",
      requiredArtifacts: [directory("import-configs", "Import configs", "data/import-configs")],
      optionalArtifacts: [],
    },
    {
      stepId: "analyze-failures",
      requiredArtifacts: [
        file(
          "batch-import-summary",
          "Batch import summary",
          DEFAULT_BATCH_IMPORT_FAILURE_ANALYSIS_INPUT_PATH,
        ),
      ],
      optionalArtifacts: [],
    },
    {
      stepId: "fixtures",
      requiredArtifacts: [directory("imports", "Imported bronze datasets", "data/imports")],
      optionalArtifacts: [],
    },
    {
      stepId: "registry",
      requiredArtifacts: [directory("fixtures", "Replay fixtures", "data/fixtures")],
      optionalArtifacts: [],
    },
    {
      stepId: "sweep",
      requiredArtifacts: [
        directory("research-datasets", "Research dataset registry", "data/research-datasets"),
      ],
      optionalArtifacts: [],
    },
    {
      stepId: "aggregate",
      requiredArtifacts: [
        filesNamedUnder(
          "research-outputs",
          "Research replay outputs",
          RESEARCH_RESULTS_ROOT,
          RESEARCH_OUTPUT_FILENAME,
          1,
        ),
      ],
      optionalArtifacts: [],
    },
    {
      stepId: "leaderboard",
      requiredArtifacts: [
        filesNamedUnder(
          "aggregate-summaries",
          "Aggregate strategy summaries",
          RESEARCH_RESULTS_ROOT,
          AGGREGATE_SUMMARY_FILENAME,
          1,
        ),
      ],
      optionalArtifacts: [],
    },
    {
      stepId: "calibration",
      requiredArtifacts: [
        filesNamedUnder(
          "research-outputs",
          "Research replay outputs",
          RESEARCH_RESULTS_ROOT,
          RESEARCH_OUTPUT_FILENAME,
          1,
        ),
      ],
      optionalArtifacts: [],
    },
    {
      stepId: "report",
      requiredArtifacts: [
        file(
          "strategy-leaderboard",
          "Strategy leaderboard",
          DEFAULT_STRATEGY_LEADERBOARD_OUTPUT_PATH,
        ),
        filesNamedUnder(
          "aggregate-summaries",
          "Aggregate strategy summaries",
          RESEARCH_RESULTS_ROOT,
          AGGREGATE_SUMMARY_FILENAME,
          1,
        ),
      ],
      optionalArtifacts: [
        filesNamedUnder(
          "calibration-reports",
          "Calibration reports",
          RESEARCH_RESULTS_ROOT,
          "calibration-report.json",
          1,
          "optional",
        ),
      ],
      outputArtifactPath: DEFAULT_RESEARCH_REPORT_OUTPUT_PATH,
      stalenessInputPaths: [DEFAULT_STRATEGY_LEADERBOARD_OUTPUT_PATH],
    },
    {
      stepId: "lead-lag",
      requiredArtifacts: [
        filesNamedUnder(
          "research-outputs",
          "Research replay outputs",
          RESEARCH_RESULTS_ROOT,
          RESEARCH_OUTPUT_FILENAME,
          1,
        ),
      ],
      optionalArtifacts: [],
    },
    {
      stepId: "significance",
      requiredArtifacts: [
        filesNamedUnder(
          "aggregate-summaries",
          "Aggregate strategy summaries",
          RESEARCH_RESULTS_ROOT,
          AGGREGATE_SUMMARY_FILENAME,
          1,
        ),
      ],
      optionalArtifacts: [],
    },
    {
      stepId: "power-analysis",
      requiredArtifacts: [
        filesNamedUnder(
          "aggregate-summaries",
          "Aggregate strategy summaries",
          RESEARCH_RESULTS_ROOT,
          AGGREGATE_SUMMARY_FILENAME,
          1,
        ),
      ],
      optionalArtifacts: [],
    },
    {
      stepId: "overfitting-diagnostics",
      requiredArtifacts: [
        filesNamedUnder(
          "aggregate-summaries",
          "Aggregate strategy summaries",
          RESEARCH_RESULTS_ROOT,
          AGGREGATE_SUMMARY_FILENAME,
          1,
        ),
      ],
      optionalArtifacts: [
        directory("experiments", "Experiment registry", "data/experiments", "optional"),
      ],
    },
    {
      stepId: "regime-tags",
      requiredArtifacts: [
        filesNamedUnder(
          "research-outputs",
          "Research replay outputs",
          RESEARCH_RESULTS_ROOT,
          RESEARCH_OUTPUT_FILENAME,
          1,
        ),
      ],
      optionalArtifacts: [],
    },
    {
      stepId: "mispricing-atlas",
      requiredArtifacts: [
        filesNamedUnder(
          "research-outputs",
          "Research replay outputs",
          RESEARCH_RESULTS_ROOT,
          RESEARCH_OUTPUT_FILENAME,
          1,
        ),
      ],
      optionalArtifacts: [],
    },
    {
      stepId: "hypotheses",
      requiredArtifacts: [
        file("mispricing-atlas", "Mispricing atlas", DEFAULT_MISPRICING_ATLAS_INPUT_PATH),
        file("lead-lag-analysis", "Lead-lag analysis", DEFAULT_LEAD_LAG_INPUT_PATH),
        file(
          "statistical-significance",
          "Statistical significance report",
          DEFAULT_STATISTICAL_SIGNIFICANCE_INPUT_PATH,
        ),
      ],
      optionalArtifacts: [
        file("regime-tags", "Regime tags", DEFAULT_REGIME_TAGS_INPUT_PATH, "optional"),
        file(
          "strategy-leaderboard",
          "Strategy leaderboard",
          DEFAULT_STRATEGY_LEADERBOARD_INPUT_PATH,
          "optional",
        ),
      ],
      outputArtifactPath: DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
      stalenessInputPaths: [
        DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
        DEFAULT_LEAD_LAG_INPUT_PATH,
        DEFAULT_STATISTICAL_SIGNIFICANCE_INPUT_PATH,
      ],
    },
  ];

  return new Map(specs.map((spec) => [spec.stepId, spec]));
}
