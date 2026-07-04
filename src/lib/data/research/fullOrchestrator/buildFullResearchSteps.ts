import { DEFAULT_CANDIDATE_PROMOTIONS_HTML_PATH, DEFAULT_CANDIDATE_PROMOTIONS_OUTPUT_PATH } from "@/lib/data/research/candidatePromotion/candidatePromotionTypes";
import {
  DEFAULT_RESEARCH_CANDIDATE_REGISTRY_HTML_PATH,
  DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH,
} from "@/lib/data/research/candidateRegistry/researchCandidateRegistryTypes";
import {
  DEFAULT_CROSS_VALIDATION_HTML_PATH,
  DEFAULT_CROSS_VALIDATION_OUTPUT_PATH,
} from "@/lib/data/research/crossValidation/crossValidationTypes";
import { DEFAULT_DATA_HEALTH_OUTPUT_PATH } from "@/lib/data/research/dataHealth/dataHealthTypes";
import {
  DEFAULT_HARNESS_RESULTS_HTML_PATH,
  DEFAULT_HARNESS_RESULTS_OUTPUT_PATH,
} from "@/lib/data/research/harnessResults/harnessResultsTypes";
import { DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_HYPOTHESIS_EVIDENCE_HTML_PATH } from "@/lib/data/research/hypothesisEvidence/hypothesisEvidenceTypes";
import {
  DEFAULT_HYPOTHESIS_VALIDATION_HTML_PATH,
  DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
} from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import {
  COVERAGE_VALIDATION_HTML_PATH,
  COVERAGE_VALIDATION_OUTPUT_PATH,
  HISTORICAL_COVERAGE_PLAN_HTML_PATH,
  HISTORICAL_COVERAGE_PLAN_OUTPUT_PATH,
  HISTORICAL_EXPANSION_CONFIG_HTML_PATH,
  HISTORICAL_EXPANSION_CONFIG_OUTPUT_PATH,
} from "./coveragePhasePaths";
import type { FullResearchStepDefinition } from "./fullResearchOrchestratorTypes";

const MISPRICING_ATLAS_OUTPUT = "data/research-results/mispricing-atlas.json";
const STRATEGY_SYNTHESIS_OUTPUT =
  "data/research-results/strategy-synthesis-candidates.json";
const HARNESS_SUMMARY_OUTPUT =
  "data/research-results/harness/strategy-harness-summary.json";
const ARTIFACT_INDEX_JSON = "data/research-results/research-artifact-index.json";
const ARTIFACT_INDEX_HTML = "data/reports/research-artifact-index.html";
const HYPOTHESIS_LIFECYCLE_HTML = "data/reports/research-hypothesis-lifecycle.html";
const RESEARCH_DASHBOARD_HTML = "data/reports/research-dashboard.html";

/** Builds the ordered end-to-end research workflow step definitions. */
export function buildFullResearchSteps(): readonly FullResearchStepDefinition[] {
  return [
    {
      id: "data-health",
      label: "Data health report",
      npmScript: "research:data-health",
      args: [],
      expectedOutputs: [DEFAULT_DATA_HEALTH_OUTPUT_PATH],
      upstreamStepIds: [],
      independent: true,
    },
    {
      id: "coverage-plan",
      label: "Historical coverage plan",
      npmScript: "research:coverage-plan",
      args: [],
      expectedOutputs: [
        HISTORICAL_COVERAGE_PLAN_OUTPUT_PATH,
        HISTORICAL_COVERAGE_PLAN_HTML_PATH,
      ],
      upstreamStepIds: [],
      independent: false,
    },
    {
      id: "generate-expansion-import-config",
      label: "Historical expansion import config",
      npmScript: "research:generate-expansion-import-config",
      args: [],
      expectedOutputs: [
        HISTORICAL_EXPANSION_CONFIG_OUTPUT_PATH,
        HISTORICAL_EXPANSION_CONFIG_HTML_PATH,
      ],
      upstreamStepIds: ["coverage-plan"],
      independent: false,
    },
    {
      id: "mispricing-atlas",
      label: "Mispricing atlas",
      npmScript: "research:mispricing-atlas",
      args: [],
      expectedOutputs: [MISPRICING_ATLAS_OUTPUT],
      upstreamStepIds: [],
      independent: false,
    },
    {
      id: "hypotheses",
      label: "Hypothesis candidates",
      npmScript: "research:hypotheses",
      args: [],
      expectedOutputs: [
        DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
        DEFAULT_HYPOTHESIS_EVIDENCE_HTML_PATH,
      ],
      upstreamStepIds: ["mispricing-atlas"],
      independent: false,
    },
    {
      id: "hypothesis-validation",
      label: "Hypothesis validation",
      npmScript: "research:hypothesis-validation",
      args: [],
      expectedOutputs: [
        DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
        DEFAULT_HYPOTHESIS_VALIDATION_HTML_PATH,
      ],
      upstreamStepIds: ["hypotheses"],
      independent: false,
    },
    {
      id: "strategy-synthesis",
      label: "Strategy synthesis",
      npmScript: "research:strategy-synthesis",
      args: [],
      expectedOutputs: [STRATEGY_SYNTHESIS_OUTPUT],
      upstreamStepIds: ["hypothesis-validation"],
      independent: false,
    },
    {
      id: "cross-validation",
      label: "Cross-validation diagnostics",
      npmScript: "research:cross-validation",
      args: [],
      expectedOutputs: [
        DEFAULT_CROSS_VALIDATION_OUTPUT_PATH,
        DEFAULT_CROSS_VALIDATION_HTML_PATH,
      ],
      upstreamStepIds: ["strategy-synthesis", "hypothesis-validation"],
      independent: false,
    },
    {
      id: "coverage-validation",
      label: "Coverage-aware validation",
      npmScript: "research:coverage-validation",
      args: [],
      expectedOutputs: [
        COVERAGE_VALIDATION_OUTPUT_PATH,
        COVERAGE_VALIDATION_HTML_PATH,
      ],
      upstreamStepIds: ["cross-validation"],
      independent: false,
      optional: true,
    },
    {
      id: "research-harness",
      label: "Research strategy harness",
      npmScript: "research:harness",
      args: ["--input", STRATEGY_SYNTHESIS_OUTPUT],
      expectedOutputs: [HARNESS_SUMMARY_OUTPUT],
      upstreamStepIds: ["strategy-synthesis"],
      independent: false,
    },
    {
      id: "harness-results",
      label: "Harness results integration",
      npmScript: "research:harness-results",
      args: [],
      expectedOutputs: [
        DEFAULT_HARNESS_RESULTS_OUTPUT_PATH,
        DEFAULT_HARNESS_RESULTS_HTML_PATH,
      ],
      upstreamStepIds: ["research-harness"],
      independent: false,
    },
    {
      id: "candidate-registry",
      label: "Research candidate registry",
      npmScript: "research:candidate-registry",
      args: [],
      expectedOutputs: [
        DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH,
        DEFAULT_RESEARCH_CANDIDATE_REGISTRY_HTML_PATH,
      ],
      upstreamStepIds: ["harness-results"],
      independent: false,
    },
    {
      id: "candidate-promotions",
      label: "Candidate promotions",
      npmScript: "research:candidate-promotions",
      args: [],
      expectedOutputs: [
        DEFAULT_CANDIDATE_PROMOTIONS_OUTPUT_PATH,
        DEFAULT_CANDIDATE_PROMOTIONS_HTML_PATH,
      ],
      upstreamStepIds: ["candidate-registry"],
      independent: false,
    },
    {
      id: "artifact-index",
      label: "Research artifact index",
      npmScript: "research:artifact-index",
      args: [],
      expectedOutputs: [ARTIFACT_INDEX_JSON, ARTIFACT_INDEX_HTML],
      upstreamStepIds: [],
      independent: true,
    },
    {
      id: "hypothesis-lifecycle",
      label: "Hypothesis lifecycle report",
      npmScript: "research:hypothesis-lifecycle",
      args: [],
      expectedOutputs: [HYPOTHESIS_LIFECYCLE_HTML],
      upstreamStepIds: ["hypothesis-validation"],
      independent: false,
    },
    {
      id: "research-dashboard",
      label: "Research dashboard",
      npmScript: "research:dashboard",
      args: [],
      expectedOutputs: [RESEARCH_DASHBOARD_HTML],
      upstreamStepIds: [],
      independent: true,
    },
  ];
}

export { HISTORICAL_COVERAGE_PLAN_OUTPUT_PATH, HISTORICAL_EXPANSION_CONFIG_OUTPUT_PATH };
