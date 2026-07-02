import { isCliProgressTty } from "@/lib/cli/progress";
import {
  createNodeBatchImportFilesystem,
  runBatchHistoricalImport,
} from "@/lib/data/importJobs/batchImport";
import { runHistoricalImportFromConfig } from "@/lib/data/importJobs";
import type { HistoricalImportFetchLike } from "@/lib/data/importJobs";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeImportBatchArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  parseAdaptiveThrottleFromArgv,
  parseConcurrencyFromArgv,
  parseInputDirFromArgv,
  parseMaxRequestDelayMsFromArgv,
  parseMaxRetriesFromArgv,
  parseMinRequestDelayMsFromArgv,
  parseOutputDirFromArgv,
  parseOverwriteFromArgv,
  parseRequestDelayMsFromArgv,
  parseRetryBaseDelayMsFromArgv,
  parseThrottleDecreaseMsFromArgv,
  parseThrottleIncreaseFactorFromArgv,
} from "./batchTypes";
import type {
  BatchImportCommandDeps,
  BatchImportCommandIo,
  RunBatchHistoricalImportCommandOptions,
} from "./batchTypes";

function normalizeCommandOptions(
  options?: BatchImportCommandDeps | RunBatchHistoricalImportCommandOptions,
): RunBatchHistoricalImportCommandOptions {
  if (!options) {
    return {};
  }

  if ("filesystem" in options) {
    return { deps: options };
  }

  return options;
}

function createProductionDeps(
  fetchImpl?: HistoricalImportFetchLike,
): BatchImportCommandDeps {
  return {
    filesystem: createNodeBatchImportFilesystem(),
    runImport: async ({ config }) =>
      runHistoricalImportFromConfig({ config, fetchImpl }),
  };
}

export function runBatchHistoricalImportCommand(
  argv: readonly string[],
  io: BatchImportCommandIo,
  options?: BatchImportCommandDeps | RunBatchHistoricalImportCommandOptions,
): Promise<number> {
  try {
    const normalizedArgv = normalizeImportBatchArgv(argv);
    const inputDir = parseInputDirFromArgv(normalizedArgv);
    const outputDir = parseOutputDirFromArgv(normalizedArgv);
    const concurrency = parseConcurrencyFromArgv(normalizedArgv);
    const requestDelayMs = parseRequestDelayMsFromArgv(normalizedArgv);
    const maxRetries = parseMaxRetriesFromArgv(normalizedArgv);
    const retryBaseDelayMs = parseRetryBaseDelayMsFromArgv(normalizedArgv);
    const overwriteExisting = parseOverwriteFromArgv(normalizedArgv);
    const adaptiveThrottle = parseAdaptiveThrottleFromArgv(normalizedArgv);
    const minRequestDelayMs = parseMinRequestDelayMsFromArgv(normalizedArgv);
    const maxRequestDelayMs = parseMaxRequestDelayMsFromArgv(normalizedArgv);
    const throttleIncreaseFactor = parseThrottleIncreaseFactorFromArgv(normalizedArgv);
    const throttleDecreaseMs = parseThrottleDecreaseMsFromArgv(normalizedArgv);
    const { deps, fetchImpl } = normalizeCommandOptions(options);
    const runnerDeps = deps ?? createProductionDeps(fetchImpl);
    if (runnerDeps.logProgress === undefined) {
      runnerDeps.logProgress = (message) => {
        io.writeStderr(message);
      };
    }
    if (runnerDeps.isProgressTty === undefined) {
      runnerDeps.isProgressTty = isCliProgressTty();
    }

    return runBatchHistoricalImport(
      {
        inputDir,
        outputDir,
        concurrency,
        requestDelayMs,
        maxRetries,
        retryBaseDelayMs,
        overwriteExisting,
        adaptiveThrottle,
        minRequestDelayMs,
        maxRequestDelayMs,
        throttleIncreaseFactor,
        throttleDecreaseMs,
      },
      runnerDeps,
    ).then(
      (summary) => {
        io.writeStdout(
          formatStdoutOutput(
            stableStringify({
              summaryPath: summary.summaryPath,
              totalConfigs: summary.totalConfigs,
              successfulImports: summary.successfulImports,
              failedImports: summary.failedImports,
              skippedImports: summary.skippedImports,
              retryCount: summary.retryCount,
              recoveredImports: summary.recoveredImports,
              failedAfterRetries: summary.failedAfterRetries,
              durationMs: summary.durationMs,
            }),
          ),
        );
        return 0;
      },
      (error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Batch historical import command failed";
        io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
        return 1;
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Batch historical import command failed";
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return Promise.resolve(1);
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  return runBatchHistoricalImportCommand(argv, {
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
  });
}

if (process.env.VITEST !== "true") {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
