import {
  DEFAULT_CALIBRATION_INPUT_DIR,
} from "@/lib/data/research/calibration/calibrationTypes";
import {
  DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
  DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
  DEFAULT_REGIME_TAGS_INPUT_PATH,
} from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import {
  DEFAULT_HYPOTHESIS_VALIDATION_HTML_PATH,
  DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
} from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

export class HypothesisValidationCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HypothesisValidationCommandError";
  }
}

export type HypothesisValidationCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  readdir: (path: string) => readonly string[];
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HypothesisValidationCommandError(`Missing value for ${flag} <path>`);
      }

      return next;
    }
  }

  return undefined;
}

export function parseOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
): string {
  return readFlagValue(argv, "--output") ?? defaultPath;
}

export function parseHtmlOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_HYPOTHESIS_VALIDATION_HTML_PATH,
): string {
  return readFlagValue(argv, "--html-output") ?? defaultPath;
}

export function parseInputPathsFromArgv(argv: readonly string[]): {
  hypothesisCandidatesPath: string;
  mispricingAtlasPath: string;
  researchResultsDir: string;
  regimeTagsPath: string;
} {
  return {
    hypothesisCandidatesPath:
      readFlagValue(argv, "--hypothesis-candidates")
      ?? DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
    mispricingAtlasPath:
      readFlagValue(argv, "--mispricing-atlas")
      ?? DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
    researchResultsDir:
      readFlagValue(argv, "--research-results-dir")
      ?? DEFAULT_CALIBRATION_INPUT_DIR,
    regimeTagsPath:
      readFlagValue(argv, "--regime-tags")
      ?? DEFAULT_REGIME_TAGS_INPUT_PATH,
  };
}

export function parseMemoryReportFlag(argv: readonly string[]): boolean {
  return argv.includes("--memory-report");
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
