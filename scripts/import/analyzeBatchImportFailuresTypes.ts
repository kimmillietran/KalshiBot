import {
  DEFAULT_BATCH_IMPORT_FAILURE_ANALYSIS_INPUT_PATH,
  DEFAULT_BATCH_IMPORT_FAILURE_ANALYSIS_OUTPUT_PATH,
} from "@/lib/data/importJobs/batchImport";

export class AnalyzeBatchImportFailuresCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyzeBatchImportFailuresCommandError";
  }
}

export type AnalyzeBatchImportFailuresCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  fileExists: (path: string) => boolean;
};

export function parseInputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_BATCH_IMPORT_FAILURE_ANALYSIS_INPUT_PATH,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new AnalyzeBatchImportFailuresCommandError(
          "Missing value for --input <path>",
        );
      }
      return next;
    }
  }

  return defaultPath;
}

export function parseOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_BATCH_IMPORT_FAILURE_ANALYSIS_OUTPUT_PATH,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new AnalyzeBatchImportFailuresCommandError(
          "Missing value for --output <path>",
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
