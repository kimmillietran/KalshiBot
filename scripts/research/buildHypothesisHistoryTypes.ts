import {
  DEFAULT_HYPOTHESIS_EVOLUTION_HTML_PATH,
  DEFAULT_HYPOTHESIS_HISTORY_OUTPUT_PATH,
  HypothesisEvolutionError,
} from "@/lib/data/research/hypothesisEvolution";

export class HypothesisHistoryCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HypothesisHistoryCommandError";
  }
}

export type HypothesisHistoryCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

export function parseHistoryOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_HYPOTHESIS_HISTORY_OUTPUT_PATH,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HypothesisHistoryCommandError("Missing value for --output <path>");
      }
      return next;
    }
  }

  return defaultPath;
}

export function parseHtmlOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_HYPOTHESIS_EVOLUTION_HTML_PATH,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--html-output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HypothesisHistoryCommandError("Missing value for --html-output <path>");
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
  if (error instanceof HypothesisHistoryCommandError) {
    return error.message;
  }

  if (error instanceof HypothesisEvolutionError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Hypothesis history update failed";
}

export { HypothesisEvolutionError };
