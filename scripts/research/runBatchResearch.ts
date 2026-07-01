import {
  createNodeBatchResearchFilesystem,
  runBatchResearch,
} from "@/lib/data/research/batchResearch";
import { runHistoricalResearchFromBronze } from "@/lib/data/research/runner";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { parseHistoricalResearchInputJson } from "./runHistoricalResearch";
import { resolveBuiltinStrategy } from "./types";
import {
  formatStdoutOutput,
  parseConcurrencyFromArgv,
  parseOutputDirFromArgv,
  parseRegistryDirFromArgv,
  parseSummaryPathFromArgv,
} from "./batchTypes";
import type {
  BatchResearchCommandDeps,
  BatchResearchCommandIo,
  RunBatchResearchCommandOptions,
} from "./batchTypes";

function normalizeCommandOptions(
  options?: BatchResearchCommandDeps | RunBatchResearchCommandOptions,
): RunBatchResearchCommandOptions {
  if (!options) {
    return {};
  }

  if ("filesystem" in options) {
    return { deps: options };
  }

  return options;
}

function createProductionDeps(): BatchResearchCommandDeps {
  return {
    filesystem: createNodeBatchResearchFilesystem(),
    parseFixtureJson: (json, marketTicker) => {
      try {
        return parseHistoricalResearchInputJson(json);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid fixture";
        throw new Error(
          marketTicker ? `${message} (${marketTicker})` : message,
        );
      }
    },
    runResearch: ({ fixture }) => {
      const result = runHistoricalResearchFromBronze({
        bronzeRecords: fixture.bronzeRecords,
        strategy: resolveBuiltinStrategy(fixture.strategyId),
        engineConfig: fixture.engineConfig,
        initialCashCents: fixture.initialCashCents,
        runId: fixture.runId,
        durationMs: fixture.durationMs,
        fillConfig: fixture.fillConfig,
        metricsConfig: fixture.metricsConfig,
      });

      return result.serialized;
    },
  };
}

export function runBatchResearchCommand(
  argv: readonly string[],
  io: BatchResearchCommandIo,
  options?: BatchResearchCommandDeps | RunBatchResearchCommandOptions,
): Promise<number> {
  try {
    const registryDir = parseRegistryDirFromArgv(argv);
    const outputDir = parseOutputDirFromArgv(argv);
    const concurrency = parseConcurrencyFromArgv(argv);
    const summaryPath = parseSummaryPathFromArgv(argv);
    const { deps } = normalizeCommandOptions(options);
    const runnerDeps = deps ?? createProductionDeps();

    return runBatchResearch(
      {
        registryDir,
        outputDir,
        concurrency,
        summaryPath,
      },
      runnerDeps,
    ).then(
      (summary) => {
        io.writeStdout(
          formatStdoutOutput(
            stableStringify({
              summaryPath: summary.summaryPath,
              totalDatasets: summary.totalDatasets,
              successfulRuns: summary.successfulRuns,
              failedRuns: summary.failedRuns,
              skippedRuns: summary.skippedRuns,
              durationMs: summary.durationMs,
            }),
          ),
        );
        return 0;
      },
      (error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Batch research command failed";
        io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
        return 1;
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Batch research command failed";
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return Promise.resolve(1);
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  return runBatchResearchCommand(argv, {
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
