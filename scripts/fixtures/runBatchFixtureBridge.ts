import {
  buildDefaultBatchFixtureBridgeOptions,
  createNodeBatchFixtureBridgeFilesystem,
  runBatchFixtureBridge,
} from "@/lib/data/importJobs/batchFixtureBridge";
import type { BatchFixtureBridgeOptions } from "@/lib/data/importJobs/batchFixtureBridge";
import { serializeHistoricalResearchFixtureFromImportResult } from "@/lib/data/importJobs/fixtureBridge";

import { normalizeFixturesBatchArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  parseInputDirFromArgv,
  parseOutputDirFromArgv,
  parseSummaryPathFromArgv,
} from "./batchTypes";
import type {
  BatchFixtureBridgeCommandDeps,
  BatchFixtureBridgeCommandIo,
  RunBatchFixtureBridgeCommandOptions,
} from "./batchTypes";

function normalizeCommandOptions(
  options?: BatchFixtureBridgeCommandDeps | RunBatchFixtureBridgeCommandOptions,
): RunBatchFixtureBridgeCommandOptions {
  if (!options) {
    return {};
  }

  if ("filesystem" in options) {
    return { deps: options };
  }

  return options;
}

function createProductionDeps(
  bridgeOptions?: BatchFixtureBridgeOptions,
): BatchFixtureBridgeCommandDeps {
  return {
    filesystem: createNodeBatchFixtureBridgeFilesystem(),
    runFixtureBridge: ({ importResult, marketTicker }) =>
      serializeHistoricalResearchFixtureFromImportResult({
        importResult,
        ...buildDefaultBatchFixtureBridgeOptions(marketTicker, bridgeOptions),
      }),
  };
}

export function runBatchFixtureBridgeCommand(
  argv: readonly string[],
  io: BatchFixtureBridgeCommandIo,
  options?: BatchFixtureBridgeCommandDeps | RunBatchFixtureBridgeCommandOptions,
): Promise<number> {
  try {
    const normalizedArgv = normalizeFixturesBatchArgv(argv);
    const inputDir = parseInputDirFromArgv(normalizedArgv);
    const outputDir = parseOutputDirFromArgv(normalizedArgv);
    const summaryPath = parseSummaryPathFromArgv(normalizedArgv);
    const { deps, bridgeOptions } = normalizeCommandOptions(options);
    const runnerDeps = deps ?? createProductionDeps(bridgeOptions);

    return runBatchFixtureBridge(
      {
        inputDir,
        outputDir,
        summaryPath,
        bridgeOptions,
      },
      runnerDeps,
    ).then(
      (summary) => {
        io.writeStdout(
          formatStdoutOutput(
            JSON.stringify({
              summaryPath: summary.summaryPath,
              totalImports: summary.totalImports,
              successfulFixtures: summary.successfulFixtures,
              failedFixtures: summary.failedFixtures,
              skippedFixtures: summary.skippedFixtures,
              durationMs: summary.durationMs,
            }),
          ),
        );
        return 0;
      },
      (error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Batch fixture bridge command failed";
        io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
        return 1;
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Batch fixture bridge command failed";
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return Promise.resolve(1);
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  return runBatchFixtureBridgeCommand(argv, {
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
