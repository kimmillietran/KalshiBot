import {
  DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS,
  DEFAULT_STRATEGY_EVALUATION_READINESS_HTML_PATH,
  DEFAULT_STRATEGY_EVALUATION_READINESS_OUTPUT_PATH,
  type StrategyEvaluationInputPaths,
} from "./strategyEvaluationReadinessTypes";
import { resolveCaptureRunSelection } from "../downstreamAnalysisScope/resolveCaptureRunSelection";

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

export function parseStrategyEvaluationReadinessPathsFromArgv(
  argv: readonly string[],
): {
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: StrategyEvaluationInputPaths;
} {
  const selection = resolveCaptureRunSelection({
    argv,
    defaultForwardQuotesDir: DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.forwardQuotesDir,
  });

  return {
    outputPath: readFlagValue(
      argv,
      "--output",
      DEFAULT_STRATEGY_EVALUATION_READINESS_OUTPUT_PATH,
    ),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_STRATEGY_EVALUATION_READINESS_HTML_PATH,
    ),
    inputPaths: {
      forwardQuotesDir: selection.forwardQuotesDir,
      captureRunDir: selection.captureRunDir,
      artifacts: {
        forwardCaptureReadiness: readFlagValue(
          argv,
          "--forward-capture-readiness",
          DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.forwardCaptureReadiness,
        ),
        staticParityScan: readFlagValue(
          argv,
          "--static-parity-scan",
          DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.staticParityScan,
        ),
        bidSizeCoverageAudit: readFlagValue(
          argv,
          "--bid-size-coverage-audit",
          DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.bidSizeCoverageAudit,
        ),
        bidOnlyCandidateLifecycle: readFlagValue(
          argv,
          "--bid-only-candidate-lifecycle",
          DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.bidOnlyCandidateLifecycle,
        ),
        captureQualityValidation: readFlagValue(
          argv,
          "--capture-quality-validation",
          DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.captureQualityValidation,
        ),
        validBookCoverageInvestigation: readFlagValue(
          argv,
          "--valid-book-coverage",
          DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.validBookCoverageInvestigation,
        ),
      },
    },
  };
}
