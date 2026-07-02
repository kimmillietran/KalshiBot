import {
  DEFAULT_BATCH_IMPORT_INPUT_DIR,
  DEFAULT_BATCH_IMPORT_OUTPUT_DIR,
} from "@/lib/data/importJobs/batchImport";

export class BatchImportCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BatchImportCommandError";
  }
}

export type BatchImportCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
};

export type BatchImportCommandDeps = {
  filesystem: import("@/lib/data/importJobs/batchImport").BatchImportFilesystem;
  runImport: import("@/lib/data/importJobs/batchImport").RunSingleBatchImportFn;
  now?: () => Date;
};

export type RunBatchHistoricalImportCommandOptions = {
  deps?: BatchImportCommandDeps;
  fetchImpl?: import("@/lib/data/importJobs").HistoricalImportFetchLike;
};

export function parseInputDirFromArgv(
  argv: readonly string[],
  defaultInputDir = DEFAULT_BATCH_IMPORT_INPUT_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BatchImportCommandError("Missing value for --input-dir <path>");
      }
      return next;
    }
  }

  return defaultInputDir;
}

export function parseOutputDirFromArgv(
  argv: readonly string[],
  defaultOutputDir = DEFAULT_BATCH_IMPORT_OUTPUT_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BatchImportCommandError("Missing value for --output-dir <path>");
      }
      return next;
    }
  }

  return defaultOutputDir;
}

export function parseConcurrencyFromArgv(argv: readonly string[]): number | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--concurrency") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BatchImportCommandError("Missing value for --concurrency <n>");
      }

      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new BatchImportCommandError("concurrency must be a positive integer");
      }

      return parsed;
    }
  }

  return undefined;
}

function parseNonNegativeIntegerFlag(
  argv: readonly string[],
  flag: string,
  errorMessage: string,
): number | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BatchImportCommandError(`Missing value for ${flag} <n>`);
      }

      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new BatchImportCommandError(errorMessage);
      }

      return parsed;
    }
  }

  return undefined;
}

export function parseRequestDelayMsFromArgv(argv: readonly string[]): number | undefined {
  return parseNonNegativeIntegerFlag(
    argv,
    "--request-delay-ms",
    "request-delay-ms must be a non-negative integer",
  );
}

export function parseMaxRetriesFromArgv(argv: readonly string[]): number | undefined {
  return parseNonNegativeIntegerFlag(
    argv,
    "--max-retries",
    "max-retries must be a non-negative integer",
  );
}

export function parseRetryBaseDelayMsFromArgv(argv: readonly string[]): number | undefined {
  return parseNonNegativeIntegerFlag(
    argv,
    "--retry-base-delay-ms",
    "retry-base-delay-ms must be a non-negative integer",
  );
}

export function parseOverwriteFromArgv(argv: readonly string[]): boolean {
  return argv.includes("--overwrite");
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
