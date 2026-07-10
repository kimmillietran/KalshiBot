import {
  DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_HTML_PATH,
  DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_INPUT_PATHS,
  DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_OUTPUT_PATH,
  type ExecutableConfirmationDesignInputPaths,
} from "./executableConfirmationDesignTypes";

function readFlagValue(argv: readonly string[], flag: string, defaultValue: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new Error(`Missing value for ${flag} <path>`);
      }
      return next;
    }

    if (argv[index]?.startsWith(`${flag}=`)) {
      return argv[index]!.slice(flag.length + 1);
    }
  }

  return defaultValue;
}

export function parseExecutableConfirmationDesignPathsFromArgv(
  argv: readonly string[],
): {
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ExecutableConfirmationDesignInputPaths;
} {
  return {
    outputPath: readFlagValue(
      argv,
      "--output",
      DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_OUTPUT_PATH,
    ),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_HTML_PATH,
    ),
    inputPaths: {
      staticParityScanPath: readFlagValue(
        argv,
        "--static-parity-scan",
        DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_INPUT_PATHS.staticParityScanPath,
      ),
      bidOnlyCandidateLifecyclePath: readFlagValue(
        argv,
        "--bid-only-lifecycle",
        DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_INPUT_PATHS.bidOnlyCandidateLifecyclePath,
      ),
      forwardCaptureReadinessPath: readFlagValue(
        argv,
        "--forward-capture-readiness",
        DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_INPUT_PATHS.forwardCaptureReadinessPath,
      ),
    },
  };
}
