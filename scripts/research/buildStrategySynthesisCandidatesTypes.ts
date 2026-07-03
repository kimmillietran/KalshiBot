import {
  DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
} from "@/lib/data/research/hypothesisCandidates";
import {
  DEFAULT_HYPOTHESIS_VALIDATION_INPUT_PATH,
  DEFAULT_STRATEGY_SYNTHESIS_OUTPUT_PATH,
} from "@/lib/data/research/strategySynthesis";

export class StrategySynthesisCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrategySynthesisCommandError";
  }
}

export type StrategySynthesisCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

export function parseOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_STRATEGY_SYNTHESIS_OUTPUT_PATH,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new StrategySynthesisCommandError(
          "Missing value for --output <path>",
        );
      }
      return next;
    }
  }

  return defaultPath;
}

export function parseInputPathsFromArgv(argv: readonly string[]): {
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
} {
  return {
    hypothesisCandidatesPath: parseArtifactPathFromArgv(
      argv,
      "--hypothesis-candidates",
      DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
    ),
    hypothesisValidationPath: parseArtifactPathFromArgv(
      argv,
      "--hypothesis-validation",
      DEFAULT_HYPOTHESIS_VALIDATION_INPUT_PATH,
    ),
  };
}

function parseArtifactPathFromArgv(
  argv: readonly string[],
  flag: string,
  defaultPath: string,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new StrategySynthesisCommandError(
          `Missing value for ${flag} <path>`,
        );
      }
      return next;
    }
  }

  return defaultPath;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof StrategySynthesisCommandError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Strategy synthesis failed";
}
