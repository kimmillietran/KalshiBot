import {
  DEFAULT_STATISTICAL_SIGNIFICANCE_INPUT_DIR,
  DEFAULT_STATISTICAL_SIGNIFICANCE_OUTPUT_PATH,
} from "@/lib/data/research/statisticalSignificance";

export class StatisticalSignificanceCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatisticalSignificanceCommandError";
  }
}

export type StatisticalSignificanceCommandIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

export function parseInputDirFromArgv(
  argv: readonly string[],
  defaultDir = DEFAULT_STATISTICAL_SIGNIFICANCE_INPUT_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new StatisticalSignificanceCommandError(
          "Missing value for --input-dir <path>",
        );
      }
      return next;
    }
  }

  return defaultDir;
}

export function parseOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_STATISTICAL_SIGNIFICANCE_OUTPUT_PATH,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new StatisticalSignificanceCommandError(
          "Missing value for --output <path>",
        );
      }
      return next;
    }
  }

  return defaultPath;
}

export function parseSeedFromArgv(
  argv: readonly string[],
  defaultSeed: number,
): number {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--seed") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new StatisticalSignificanceCommandError(
          "Missing value for --seed <number>",
        );
      }

      const parsed = Number(next);
      if (!Number.isFinite(parsed)) {
        throw new StatisticalSignificanceCommandError(
          `Invalid seed value: ${next}`,
        );
      }

      return parsed;
    }
  }

  return defaultSeed;
}

export function parseSimulationCountFromArgv(
  argv: readonly string[],
  defaultSimulationCount: number,
): number {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--simulations") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new StatisticalSignificanceCommandError(
          "Missing value for --simulations <count>",
        );
      }

      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new StatisticalSignificanceCommandError(
          `Invalid simulation count: ${next}`,
        );
      }

      return parsed;
    }
  }

  return defaultSimulationCount;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof StatisticalSignificanceCommandError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Statistical significance build failed";
}
