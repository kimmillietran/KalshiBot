import { isCliProgressTty } from "@/lib/cli/progress";
import {
  createNodeStrategySweepFilesystem,
  runStrategySweep,
} from "@/lib/data/research/sweep";
import { runHistoricalResearchFromBronze } from "@/lib/data/research/runner";
import { StrategyPluginRegistry } from "@/lib/data/strategies/plugin/StrategyPluginRegistry";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeStrategySweepArgv } from "../lib/cliArgvSchemas";

import { parseHistoricalResearchInputJson } from "./runHistoricalResearch";
import {
  formatStdoutOutput,
  parseConcurrencyFromArgv,
  parseOutputDirFromArgv,
  parseRegistryDirFromArgv,
  parseSummaryPathFromArgv,
  resolveStrategySelectionFromArgv,
} from "./strategySweepTypes";
import type {
  RunStrategySweepCommandOptions,
  StrategySweepCommandDeps,
  StrategySweepCommandIo,
} from "./strategySweepTypes";

function normalizeCommandOptions(
  options?: StrategySweepCommandDeps | RunStrategySweepCommandOptions,
): RunStrategySweepCommandOptions {
  if (!options) {
    return {};
  }

  if ("filesystem" in options) {
    return { deps: options };
  }

  return options;
}

function createProductionDeps(): StrategySweepCommandDeps {
  const strategyRegistry = StrategyPluginRegistry.createBuiltIn();

  return {
    filesystem: createNodeStrategySweepFilesystem(),
    strategyRegistry,
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
    runResearch: ({ fixture, strategyId, strategyConfig }) => {
      const strategy = strategyRegistry.resolveBacktestStrategy(
        strategyId,
        strategyConfig,
      );

      const result = runHistoricalResearchFromBronze({
        bronzeRecords: fixture.bronzeRecords,
        strategy,
        engineConfig: fixture.engineConfig,
        initialCashCents: fixture.initialCashCents,
        runId: fixture.runId,
        durationMs: fixture.durationMs,
        fillConfig: fixture.fillConfig,
        costModelConfig: fixture.costModelConfig,
        metricsConfig: fixture.metricsConfig,
      });

      return {
        researchOutput: result.serialized,
        decisionTrace: result.serializedDecisionTrace,
      };
    },
  };
}

export function runStrategySweepCommand(
  argv: readonly string[],
  io: StrategySweepCommandIo,
  options?: StrategySweepCommandDeps | RunStrategySweepCommandOptions,
): Promise<number> {
  try {
    const normalizedArgv = normalizeStrategySweepArgv(argv);
    const registryDir = parseRegistryDirFromArgv(normalizedArgv);
    const outputDir = parseOutputDirFromArgv(normalizedArgv);
    const concurrency = parseConcurrencyFromArgv(normalizedArgv);
    const summaryPath = parseSummaryPathFromArgv(normalizedArgv);
    const { deps } = normalizeCommandOptions(options);
    const runnerDeps = deps ?? createProductionDeps();
    if (runnerDeps.logProgress === undefined) {
      runnerDeps.logProgress = (message) => {
        io.writeStderr(message);
      };
    }
    if (runnerDeps.isProgressTty === undefined) {
      runnerDeps.isProgressTty = isCliProgressTty();
    }
    const strategyIds = resolveStrategySelectionFromArgv(
      normalizedArgv,
      () => runnerDeps.strategyRegistry.listStrategyIds(),
    );

    return runStrategySweep(
      {
        registryDir,
        outputDir,
        strategyIds,
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
              strategiesExecuted: summary.strategiesExecuted,
              marketsTested: summary.marketsTested,
              totalRuns: summary.totalRuns,
              successfulRuns: summary.successfulRuns,
              failedRuns: summary.failedRuns,
              durationMs: summary.durationMs,
            }),
          ),
        );
        return summary.failedRuns > 0 ? 1 : 0;
      },
      (error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Strategy sweep command failed";
        io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
        return 1;
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Strategy sweep command failed";
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return Promise.resolve(1);
  }
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> {
  return runStrategySweepCommand(argv, {
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

export {
  StrategySweepCommandError,
  formatStdoutOutput,
  parseAllStrategiesFromArgv,
  parseConcurrencyFromArgv,
  parseOutputDirFromArgv,
  parseRegistryDirFromArgv,
  parseStrategyIdsFromArgv,
  parseSummaryPathFromArgv,
  resolveStrategySelectionFromArgv,
} from "./strategySweepTypes";
