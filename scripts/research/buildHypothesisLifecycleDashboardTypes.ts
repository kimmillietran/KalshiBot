import {
  DEFAULT_HYPOTHESIS_LIFECYCLE_HTML_PATH,
  DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS,
} from "@/lib/data/research/hypothesisLifecycle";

export class HypothesisLifecycleCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HypothesisLifecycleCommandError";
  }
}

export type HypothesisLifecycleCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  fileExists: (path: string) => boolean;
  getLastModified: (path: string) => string | null;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

function readFlagValue(argv: readonly string[], flag: string, defaultValue: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HypothesisLifecycleCommandError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }
  return defaultValue;
}

export function parseOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--output", DEFAULT_HYPOTHESIS_LIFECYCLE_HTML_PATH);
}

export function parseHypothesisCandidatesPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--hypothesis-candidates",
    DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.hypothesisCandidatesPath,
  );
}

export function parseEvidenceHtmlPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--evidence-html",
    DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.evidenceHtmlPath,
  );
}

export function parseHypothesisValidationPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--hypothesis-validation",
    DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.hypothesisValidationPath,
  );
}

export function parseStrategySynthesisPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--strategy-synthesis",
    DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.strategySynthesisPath,
  );
}

export function parseStrategyHarnessSummaryPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--harness-summary",
    DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.strategyHarnessSummaryPath,
  );
}

export function parseStrategyHarnessOutputDirFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--harness-dir",
    DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.strategyHarnessOutputDir,
  );
}

export function formatStdoutOutput(payload: string): string {
  return `${payload}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof HypothesisLifecycleCommandError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Hypothesis lifecycle dashboard failed";
}
