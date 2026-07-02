import {
  createNodeWalkForwardSweepFilesystem,
  runWalkForwardStrategySweep,
} from "@/lib/data/research/walkForwardSweep";
import { runHistoricalResearchFromBronze } from "@/lib/data/research/runner";
import { StrategyPluginRegistry } from "@/lib/data/strategies/plugin/StrategyPluginRegistry";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { parseHistoricalResearchInputJson } from "./runHistoricalResearch";
import {
  formatStdoutOutput,
  parseConcurrencyFromArgv,
  parseOutputDirFromArgv,
  parseSplitIdFromArgv,
  parseSplitInputDirFromArgv,
  resolveStrategySelectionFromArgv,
} from "./walkForwardSweepCommandTypes";
import type {
  RunWalkForwardSweepCommandOptions,
  WalkForwardSweepCommandDeps,
  WalkForwardSweepCommandIo,
} from "./walkForwardSweepCommandTypes";

function normalizeCommandOptions(
  options?: WalkForwardSweepCommandDeps | RunWalkForwardSweepCommandOptions,
): RunWalkForwardSweepCommandOptions {
  if (!options) {
    return {};
  }

  if ("filesystem" in options) {
    return { deps: options };
  }

  return options;
}

function createProductionDeps(): WalkForwardSweepCommandDeps {
  const strategyRegistry = StrategyPluginRegistry.createBuiltIn();

  return {
    filesystem: createNodeWalkForwardSweepFilesystem(),
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

      return result.serialized;
    },
  };
}

export function runWalkForwardStrategySweepCommand(
  argv: readonly string[],
  io: WalkForwardSweepCommandIo,
  options?: WalkForwardSweepCommandDeps | RunWalkForwardSweepCommandOptions,
): Promise<number> {
  try {
    const splitId = parseSplitIdFromArgv(argv);
    if (!splitId?.trim()) {
      throw new Error("Missing required --split-id <id>");
    }

    const splitInputDir = parseSplitInputDirFromArgv(argv);
    const outputDir = parseOutputDirFromArgv(argv);
    const concurrency = parseConcurrencyFromArgv(argv);
    const { deps } = normalizeCommandOptions(options);
    const runnerDeps = deps ?? createProductionDeps();
    const strategyIds = resolveStrategySelectionFromArgv(
      argv,
      () => runnerDeps.strategyRegistry.listStrategyIds(),
    );

    return runWalkForwardStrategySweep(
      {
        splitId,
        splitInputDir,
        outputDir,
        strategyIds,
        concurrency,
      },
      runnerDeps,
    ).then(
      (summary) => {
        io.writeStdout(
          formatStdoutOutput(
            stableStringify({
              summaryPath: summary.summaryPath,
              splitId: summary.splitId,
              foldsExecuted: summary.foldsExecuted,
              strategiesExecuted: summary.strategiesExecuted,
              marketsEvaluated: summary.marketsEvaluated,
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
          error instanceof Error ? error.message : "Walk-forward strategy sweep failed";
        io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
        return 1;
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Walk-forward strategy sweep failed";
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return Promise.resolve(1);
  }
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> {
  return runWalkForwardStrategySweepCommand(argv, {
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
  WalkForwardSweepCommandError,
  formatStdoutOutput,
  parseAllStrategiesFromArgv,
  parseConcurrencyFromArgv,
  parseOutputDirFromArgv,
  parseSplitIdFromArgv,
  parseSplitInputDirFromArgv,
  parseStrategyIdsFromArgv,
  resolveStrategySelectionFromArgv,
} from "./walkForwardSweepCommandTypes";
