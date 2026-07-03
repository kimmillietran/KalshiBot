import {
  DEFAULT_RESEARCH_CANDIDATE_REGISTRY_HTML_PATH,
  DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS,
  DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH,
} from "@/lib/data/research/candidateRegistry";

export class ResearchCandidateRegistryCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchCandidateRegistryCommandError";
  }
}

export type ResearchCandidateRegistryCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  fileExists: (path: string) => boolean;
};

function readFlagValue(argv: readonly string[], flag: string, defaultValue: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new ResearchCandidateRegistryCommandError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }
  return defaultValue;
}

export function parseOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--output", DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH);
}

export function parseHtmlOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--html-output", DEFAULT_RESEARCH_CANDIDATE_REGISTRY_HTML_PATH);
}

export function parseHypothesisCandidatesPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--hypothesis-candidates",
    DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS.hypothesisCandidatesPath,
  );
}

export function parseHypothesisValidationPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--hypothesis-validation",
    DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS.hypothesisValidationPath,
  );
}

export function parseStrategySynthesisPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--strategy-synthesis",
    DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS.strategySynthesisPath,
  );
}

export function parseHarnessResultsPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--harness-results",
    DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS.harnessResultsPath,
  );
}

export function parseHarnessSummaryFallbackPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--harness-summary",
    DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS.harnessSummaryFallbackPath,
  );
}

export function formatStdoutOutput(payload: string): string {
  return `${payload}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof ResearchCandidateRegistryCommandError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Research candidate registry failed";
}
