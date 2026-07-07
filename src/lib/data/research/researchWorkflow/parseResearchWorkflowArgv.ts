import {
  DEFAULT_RESEARCH_WORKFLOW_HTML_PATH,
  DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS,
  DEFAULT_RESEARCH_WORKFLOW_OUTPUT_PATH,
  type ResearchWorkflowInputPaths,
} from "./researchWorkflowTypes";

function readFlagValue(argv: readonly string[], flag: string, defaultValue: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new Error(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }

  return defaultValue;
}

export function parseResearchWorkflowPathsFromArgv(
  argv: readonly string[],
): {
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchWorkflowInputPaths;
} {
  return {
    outputPath: readFlagValue(argv, "--output", DEFAULT_RESEARCH_WORKFLOW_OUTPUT_PATH),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_RESEARCH_WORKFLOW_HTML_PATH,
    ),
    inputPaths: {
      hypothesisFailureAnalysisPath: readFlagValue(
        argv,
        "--hypothesis-failure-analysis",
        DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.hypothesisFailureAnalysisPath,
      ),
      derivedSettlementSensitivityPath: readFlagValue(
        argv,
        "--derived-settlement-sensitivity",
        DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.derivedSettlementSensitivityPath,
      ),
      hypothesisRefinementsPath: readFlagValue(
        argv,
        "--hypothesis-refinements",
        DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.hypothesisRefinementsPath,
      ),
      refinementHypothesisCandidatesPath: readFlagValue(
        argv,
        "--refinement-hypothesis-candidates",
        DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.refinementHypothesisCandidatesPath,
      ),
      strategySynthesisDebugPath: readFlagValue(
        argv,
        "--strategy-synthesis-debug",
        DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.strategySynthesisDebugPath,
      ),
      monthRegimeAnalysisPath: readFlagValue(
        argv,
        "--month-regime-analysis",
        DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.monthRegimeAnalysisPath,
      ),
      harnessSummaryPath: readFlagValue(
        argv,
        "--harness-summary",
        DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.harnessSummaryPath,
      ),
    },
  };
}
