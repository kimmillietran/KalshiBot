import {
  createNodeBatchImportFilesystem,
  runBatchHistoricalImport,
} from "@/lib/data/importJobs/batchImport";
import { runHistoricalImportFromConfig } from "@/lib/data/importJobs";
import type { HistoricalImportFetchLike } from "@/lib/data/importJobs";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  formatStdoutOutput,
  parseConcurrencyFromArgv,
  parseInputDirFromArgv,
  parseOutputDirFromArgv,
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
    const inputDir = parseInputDirFromArgv(argv);
    const outputDir = parseOutputDirFromArgv(argv);
    const concurrency = parseConcurrencyFromArgv(argv);
    const { deps, fetchImpl } = normalizeCommandOptions(options);
    const runnerDeps = deps ?? createProductionDeps(fetchImpl);

    return runBatchHistoricalImport(
      {
        inputDir,
        outputDir,
        concurrency,
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
