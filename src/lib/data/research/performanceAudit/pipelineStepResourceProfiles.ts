import { DEFAULT_CANDIDATE_PROMOTIONS_OUTPUT_PATH } from "@/lib/data/research/candidatePromotion/candidatePromotionTypes";
import {
  DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH,
} from "@/lib/data/research/candidateRegistry/researchCandidateRegistryTypes";
import {
  DEFAULT_CROSS_VALIDATION_OUTPUT_PATH,
} from "@/lib/data/research/crossValidation/crossValidationTypes";
import { DEFAULT_DATA_HEALTH_OUTPUT_PATH } from "@/lib/data/research/dataHealth/dataHealthTypes";
import {
  DEFAULT_HARNESS_RESULTS_OUTPUT_PATH,
} from "@/lib/data/research/harnessResults/harnessResultsTypes";
import { DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_HYPOTHESIS_EVIDENCE_HTML_PATH } from "@/lib/data/research/hypothesisEvidence/hypothesisEvidenceTypes";
import {
  DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
} from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import {
  COVERAGE_VALIDATION_OUTPUT_PATH,
  EXPANSION_REBUILD_SUMMARY_PATH,
  HISTORICAL_COVERAGE_PLAN_OUTPUT_PATH,
  HISTORICAL_EXPANSION_CONFIG_OUTPUT_PATH,
  HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH,
} from "@/lib/data/research/fullOrchestrator/coveragePhasePaths";

import type { PipelineStepResourceProfile } from "./performanceAuditTypes";

const MISPRICING_ATLAS = "data/research-results/mispricing-atlas.json";
const STRATEGY_SYNTHESIS = "data/research-results/strategy-synthesis-candidates.json";
const HARNESS_SUMMARY = "data/research-results/harness/strategy-harness-summary.json";
const ARTIFACT_INDEX = "data/research-results/research-artifact-index.json";
const REGIME_TAGS = "data/research-results/regime-tags.json";
const LEAD_LAG = "data/research-results/lead-lag-analysis.json";
const SIGNIFICANCE = "data/research-results/statistical-significance.json";
const PIPELINE_SUMMARY = "data/research-results/pipeline-summary.json";
const LEADERBOARD = "data/leaderboards/strategy-leaderboard.json";
const DISCOVERY = "discovery-result.json";

const IMPORTS_DIR = "data/imports";
const IMPORT_CONFIGS_DIR = "data/import-configs";
const FIXTURES_DIR = "data/fixtures";
const REGISTRY_DIR = "data/research-datasets";
const RESEARCH_RESULTS_DIR = "data/research-results";
const HARNESS_DIR = "data/research-results/harness";

function profile(
  stepId: string,
  options: Omit<PipelineStepResourceProfile, "stepId">,
): PipelineStepResourceProfile {
  return { stepId, ...options };
}

/** Static I/O and compute profiles for full-research pipeline steps. */
export function buildPipelineStepResourceProfiles(): ReadonlyMap<
  string,
  PipelineStepResourceProfile
> {
  const profiles: PipelineStepResourceProfile[] = [
    profile("data-health", {
      filesRead: [DISCOVERY, LEADERBOARD, "data/reports/research-report.html"],
      filesWritten: [DEFAULT_DATA_HEALTH_OUTPUT_PATH],
      directoryScans: [
        { rootPath: IMPORTS_DIR, recursive: true, purpose: "import coverage" },
        { rootPath: IMPORT_CONFIGS_DIR, recursive: true, purpose: "config coverage" },
        { rootPath: FIXTURES_DIR, recursive: true, purpose: "fixture coverage" },
        { rootPath: REGISTRY_DIR, recursive: true, purpose: "registry coverage" },
        { rootPath: RESEARCH_RESULTS_DIR, recursive: true, purpose: "research artifact freshness" },
      ],
      networkOperations: [],
      cpuBoundShare: 0.3,
      ioBoundShare: 0.7,
      largeJsonInputs: [],
      fullDirectoryRecompute: true,
    }),
    profile("coverage-plan", {
      filesRead: [
        DEFAULT_DATA_HEALTH_OUTPUT_PATH,
        MISPRICING_ATLAS,
        DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
        REGIME_TAGS,
      ],
      filesWritten: [HISTORICAL_COVERAGE_PLAN_OUTPUT_PATH],
      directoryScans: [
        { rootPath: IMPORT_CONFIGS_DIR, recursive: true, purpose: "market coverage scan" },
        { rootPath: FIXTURES_DIR, recursive: true, purpose: "fixture coverage scan" },
        { rootPath: RESEARCH_RESULTS_DIR, recursive: true, purpose: "research-output coverage scan" },
      ],
      networkOperations: [],
      cpuBoundShare: 0.25,
      ioBoundShare: 0.75,
      largeJsonInputs: [MISPRICING_ATLAS, DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH],
      fullDirectoryRecompute: true,
    }),
    profile("generate-expansion-import-config", {
      filesRead: [HISTORICAL_COVERAGE_PLAN_OUTPUT_PATH],
      filesWritten: [HISTORICAL_EXPANSION_CONFIG_OUTPUT_PATH],
      directoryScans: [],
      networkOperations: [],
      cpuBoundShare: 0.4,
      ioBoundShare: 0.6,
      largeJsonInputs: [HISTORICAL_COVERAGE_PLAN_OUTPUT_PATH],
      fullDirectoryRecompute: false,
    }),
    profile("execute-expansion-import", {
      filesRead: [HISTORICAL_EXPANSION_CONFIG_OUTPUT_PATH],
      filesWritten: [HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH],
      directoryScans: [{ rootPath: IMPORTS_DIR, recursive: true, purpose: "dedupe existing imports" }],
      networkOperations: [
        { description: "Kalshi historical market discovery API", estimatedShare: 0.35 },
        { description: "Kalshi historical candle import API", estimatedShare: 0.55 },
      ],
      cpuBoundShare: 0.1,
      ioBoundShare: 0.35,
      largeJsonInputs: [HISTORICAL_EXPANSION_CONFIG_OUTPUT_PATH],
      fullDirectoryRecompute: false,
    }),
    profile("rebuild-after-expansion", {
      filesRead: [HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH],
      filesWritten: [EXPANSION_REBUILD_SUMMARY_PATH],
      directoryScans: [
        { rootPath: IMPORTS_DIR, recursive: true, purpose: "fixture rebuild inputs" },
        { rootPath: RESEARCH_RESULTS_DIR, recursive: true, purpose: "research rebuild scope" },
      ],
      networkOperations: [
        { description: "Fixture bridge and research pipeline subprocesses", estimatedShare: 0.4 },
      ],
      cpuBoundShare: 0.35,
      ioBoundShare: 0.25,
      largeJsonInputs: [],
      fullDirectoryRecompute: true,
    }),
    profile("mispricing-atlas", {
      filesRead: [REGIME_TAGS],
      filesWritten: [MISPRICING_ATLAS],
      directoryScans: [
        {
          rootPath: RESEARCH_RESULTS_DIR,
          recursive: true,
          purpose: "research-output.json collection scan",
        },
      ],
      networkOperations: [],
      cpuBoundShare: 0.65,
      ioBoundShare: 0.35,
      largeJsonInputs: [],
      fullDirectoryRecompute: true,
    }),
    profile("hypotheses", {
      filesRead: [MISPRICING_ATLAS, LEAD_LAG, SIGNIFICANCE],
      filesWritten: [DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH, DEFAULT_HYPOTHESIS_EVIDENCE_HTML_PATH],
      directoryScans: [],
      networkOperations: [],
      cpuBoundShare: 0.55,
      ioBoundShare: 0.45,
      largeJsonInputs: [MISPRICING_ATLAS],
      fullDirectoryRecompute: false,
    }),
    profile("hypothesis-validation", {
      filesRead: [DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH, MISPRICING_ATLAS],
      filesWritten: [DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH],
      directoryScans: [],
      networkOperations: [],
      cpuBoundShare: 0.7,
      ioBoundShare: 0.3,
      largeJsonInputs: [DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH, MISPRICING_ATLAS],
      fullDirectoryRecompute: false,
    }),
    profile("strategy-synthesis", {
      filesRead: [DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH],
      filesWritten: [STRATEGY_SYNTHESIS],
      directoryScans: [],
      networkOperations: [],
      cpuBoundShare: 0.6,
      ioBoundShare: 0.4,
      largeJsonInputs: [DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH],
      fullDirectoryRecompute: false,
    }),
    profile("cross-validation", {
      filesRead: [STRATEGY_SYNTHESIS, DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH],
      filesWritten: [DEFAULT_CROSS_VALIDATION_OUTPUT_PATH],
      directoryScans: [],
      networkOperations: [],
      cpuBoundShare: 0.75,
      ioBoundShare: 0.25,
      largeJsonInputs: [STRATEGY_SYNTHESIS, DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH],
      fullDirectoryRecompute: false,
    }),
    profile("coverage-validation", {
      filesRead: [
        DEFAULT_CROSS_VALIDATION_OUTPUT_PATH,
        HISTORICAL_COVERAGE_PLAN_OUTPUT_PATH,
        DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
      ],
      filesWritten: [COVERAGE_VALIDATION_OUTPUT_PATH],
      directoryScans: [],
      networkOperations: [],
      cpuBoundShare: 0.6,
      ioBoundShare: 0.4,
      largeJsonInputs: [DEFAULT_CROSS_VALIDATION_OUTPUT_PATH],
      fullDirectoryRecompute: false,
    }),
    profile("research-harness", {
      filesRead: [STRATEGY_SYNTHESIS],
      filesWritten: [HARNESS_SUMMARY],
      directoryScans: [{ rootPath: FIXTURES_DIR, recursive: true, purpose: "replay fixture resolution" }],
      networkOperations: [],
      cpuBoundShare: 0.85,
      ioBoundShare: 0.15,
      largeJsonInputs: [STRATEGY_SYNTHESIS],
      fullDirectoryRecompute: true,
    }),
    profile("harness-results", {
      filesRead: [HARNESS_SUMMARY, STRATEGY_SYNTHESIS],
      filesWritten: [DEFAULT_HARNESS_RESULTS_OUTPUT_PATH],
      directoryScans: [{ rootPath: HARNESS_DIR, recursive: true, purpose: "per-strategy harness outputs" }],
      networkOperations: [],
      cpuBoundShare: 0.45,
      ioBoundShare: 0.55,
      largeJsonInputs: [HARNESS_SUMMARY],
      fullDirectoryRecompute: false,
    }),
    profile("candidate-registry", {
      filesRead: [
        DEFAULT_HARNESS_RESULTS_OUTPUT_PATH,
        STRATEGY_SYNTHESIS,
        DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
      ],
      filesWritten: [DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH],
      directoryScans: [],
      networkOperations: [],
      cpuBoundShare: 0.4,
      ioBoundShare: 0.6,
      largeJsonInputs: [DEFAULT_HARNESS_RESULTS_OUTPUT_PATH],
      fullDirectoryRecompute: false,
    }),
    profile("candidate-promotions", {
      filesRead: [DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH],
      filesWritten: [DEFAULT_CANDIDATE_PROMOTIONS_OUTPUT_PATH],
      directoryScans: [],
      networkOperations: [],
      cpuBoundShare: 0.35,
      ioBoundShare: 0.65,
      largeJsonInputs: [DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH],
      fullDirectoryRecompute: false,
    }),
    profile("artifact-index", {
      filesRead: [DISCOVERY, LEADERBOARD],
      filesWritten: [ARTIFACT_INDEX],
      directoryScans: [
        { rootPath: IMPORTS_DIR, recursive: true, purpose: "artifact inventory" },
        { rootPath: IMPORT_CONFIGS_DIR, recursive: true, purpose: "artifact inventory" },
        { rootPath: FIXTURES_DIR, recursive: true, purpose: "artifact inventory" },
        { rootPath: REGISTRY_DIR, recursive: true, purpose: "artifact inventory" },
        { rootPath: RESEARCH_RESULTS_DIR, recursive: true, purpose: "artifact inventory" },
      ],
      networkOperations: [],
      cpuBoundShare: 0.2,
      ioBoundShare: 0.8,
      largeJsonInputs: [],
      fullDirectoryRecompute: true,
    }),
    profile("hypothesis-lifecycle", {
      filesRead: [
        DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
        DEFAULT_HYPOTHESIS_EVIDENCE_HTML_PATH,
        DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
        STRATEGY_SYNTHESIS,
        HARNESS_SUMMARY,
      ],
      filesWritten: ["data/reports/research-hypothesis-lifecycle.html"],
      directoryScans: [{ rootPath: HARNESS_DIR, recursive: true, purpose: "harness artifact linkage" }],
      networkOperations: [],
      cpuBoundShare: 0.25,
      ioBoundShare: 0.75,
      largeJsonInputs: [
        DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
        DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
        STRATEGY_SYNTHESIS,
      ],
      fullDirectoryRecompute: false,
    }),
    profile("research-dashboard", {
      filesRead: [
        PIPELINE_SUMMARY,
        "data/research-results/full-research-summary.json",
        ARTIFACT_INDEX,
        DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
        DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
        STRATEGY_SYNTHESIS,
        DEFAULT_HARNESS_RESULTS_OUTPUT_PATH,
        HARNESS_SUMMARY,
        LEADERBOARD,
        DEFAULT_DATA_HEALTH_OUTPUT_PATH,
        HISTORICAL_COVERAGE_PLAN_OUTPUT_PATH,
        HISTORICAL_EXPANSION_CONFIG_OUTPUT_PATH,
        COVERAGE_VALIDATION_OUTPUT_PATH,
      ],
      filesWritten: ["data/reports/research-dashboard.html"],
      directoryScans: [],
      networkOperations: [],
      cpuBoundShare: 0.15,
      ioBoundShare: 0.85,
      largeJsonInputs: [
        ARTIFACT_INDEX,
        DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
        STRATEGY_SYNTHESIS,
        DEFAULT_HARNESS_RESULTS_OUTPUT_PATH,
      ],
      fullDirectoryRecompute: false,
    }),
  ];

  return new Map(profiles.map((entry) => [entry.stepId, entry]));
}

export function getPipelineStepResourceProfile(
  stepId: string,
  profiles: ReadonlyMap<string, PipelineStepResourceProfile>,
): PipelineStepResourceProfile {
  return (
    profiles.get(stepId) ?? {
      stepId,
      filesRead: [],
      filesWritten: [],
      directoryScans: [],
      networkOperations: [],
      cpuBoundShare: 0.5,
      ioBoundShare: 0.5,
      largeJsonInputs: [],
      fullDirectoryRecompute: false,
    }
  );
}
