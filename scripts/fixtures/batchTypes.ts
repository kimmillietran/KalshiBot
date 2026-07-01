import {
  DEFAULT_BATCH_FIXTURE_INPUT_DIR,
  DEFAULT_BATCH_FIXTURE_OUTPUT_DIR,
  DEFAULT_BATCH_FIXTURE_SUMMARY_FILENAME,
} from "@/lib/data/importJobs/batchFixtureBridge";

export class BatchFixtureBridgeCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BatchFixtureBridgeCommandError";
  }
}

export type BatchFixtureBridgeCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
};

export type BatchFixtureBridgeCommandDeps = {
  filesystem: import("@/lib/data/importJobs/batchFixtureBridge").BatchFixtureBridgeFilesystem;
  runFixtureBridge: import("@/lib/data/importJobs/batchFixtureBridge").RunSingleBatchFixtureBridgeFn;
  now?: () => Date;
};

export type RunBatchFixtureBridgeCommandOptions = {
  deps?: BatchFixtureBridgeCommandDeps;
  bridgeOptions?: import("@/lib/data/importJobs/batchFixtureBridge").BatchFixtureBridgeOptions;
};

export function parseInputDirFromArgv(
  argv: readonly string[],
  defaultInputDir = DEFAULT_BATCH_FIXTURE_INPUT_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BatchFixtureBridgeCommandError("Missing value for --input-dir <path>");
      }
      return next;
    }
  }

  return defaultInputDir;
}

export function parseOutputDirFromArgv(
  argv: readonly string[],
  defaultOutputDir = DEFAULT_BATCH_FIXTURE_OUTPUT_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BatchFixtureBridgeCommandError("Missing value for --output-dir <path>");
      }
      return next;
    }
  }

  return defaultOutputDir;
}

export function parseSummaryPathFromArgv(
  argv: readonly string[],
  defaultSummaryPath = DEFAULT_BATCH_FIXTURE_SUMMARY_FILENAME,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--summary") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BatchFixtureBridgeCommandError("Missing value for --summary <path>");
      }
      return next;
    }
  }

  return defaultSummaryPath;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
