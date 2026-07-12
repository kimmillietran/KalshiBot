import {
  DEFAULT_FORWARD_CAPTURE_READINESS_HTML_PATH,
  DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS,
  DEFAULT_FORWARD_CAPTURE_READINESS_OUTPUT_PATH,
  type ForwardCaptureReadinessInputPaths,
} from "./forwardCaptureReadinessTypes";
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

export function parseForwardCaptureReadinessPathsFromArgv(
  argv: readonly string[],
): {
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ForwardCaptureReadinessInputPaths;
} {
  const selection = resolveCaptureRunSelection({
    argv,
    defaultForwardQuotesDir: DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS.forwardQuotesDir,
  });

  return {
    outputPath: readFlagValue(
      argv,
      "--output",
      DEFAULT_FORWARD_CAPTURE_READINESS_OUTPUT_PATH,
    ),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_FORWARD_CAPTURE_READINESS_HTML_PATH,
    ),
    inputPaths: {
      forwardQuotesDir: selection.forwardQuotesDir,
      captureRunDir: selection.captureRunDir,
      kalshiWsSpikeDir: readFlagValue(
        argv,
        "--kalshi-ws-spike-dir",
        DEFAULT_FORWARD_CAPTURE_READINESS_INPUT_PATHS.kalshiWsSpikeDir,
      ),
    },
  };
}
