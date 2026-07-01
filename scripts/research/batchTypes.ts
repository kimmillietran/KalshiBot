import {
  DEFAULT_BATCH_RESEARCH_OUTPUT_DIR,
  DEFAULT_BATCH_RESEARCH_REGISTRY_DIR,
  DEFAULT_BATCH_RESEARCH_SUMMARY_FILENAME,
} from "@/lib/data/research/batchResearch";

export class BatchResearchCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BatchResearchCommandError";
  }
}

export type BatchResearchCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
};

export type BatchResearchCommandDeps = {
  filesystem: import("@/lib/data/research/batchResearch").BatchResearchFilesystem;
  parseFixtureJson: (
    json: string,
    marketTicker?: string,
  ) => import("@/lib/data/fixtures/historicalFixtureTypes").HistoricalResearchCliInput;
  runResearch: import("@/lib/data/research/batchResearch").RunSingleBatchResearchFn;
  now?: () => Date;
};

export type RunBatchResearchCommandOptions = {
  deps?: BatchResearchCommandDeps;
};

export function parseRegistryDirFromArgv(
  argv: readonly string[],
  defaultRegistryDir = DEFAULT_BATCH_RESEARCH_REGISTRY_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--registry") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BatchResearchCommandError("Missing value for --registry <path>");
      }
      return next;
    }
  }

  return defaultRegistryDir;
}

export function parseOutputDirFromArgv(
  argv: readonly string[],
  defaultOutputDir = DEFAULT_BATCH_RESEARCH_OUTPUT_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BatchResearchCommandError("Missing value for --output-dir <path>");
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
        throw new BatchResearchCommandError("Missing value for --concurrency <n>");
      }

      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new BatchResearchCommandError("concurrency must be a positive integer");
      }

      return parsed;
    }
  }

  return undefined;
}

export function parseSummaryPathFromArgv(
  argv: readonly string[],
  defaultSummaryPath = DEFAULT_BATCH_RESEARCH_SUMMARY_FILENAME,
): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--summary") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BatchResearchCommandError("Missing value for --summary <path>");
      }
      return next;
    }
  }

  return defaultSummaryPath;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
