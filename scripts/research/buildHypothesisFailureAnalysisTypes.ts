import {
  DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_HTML_PATH,
  DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH,
} from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";

export class HypothesisFailureAnalysisCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HypothesisFailureAnalysisCommandError";
  }
}

export type HypothesisFailureAnalysisCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  fileExists: (path: string) => boolean;
};

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HypothesisFailureAnalysisCommandError(`Missing value for ${flag} <path>`);
      }

      return next;
    }
  }

  return undefined;
}

export function parseOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH,
): string {
  return readFlagValue(argv, "--output") ?? defaultPath;
}

export function parseHtmlOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_HTML_PATH,
): string {
  return readFlagValue(argv, "--html-output") ?? defaultPath;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
