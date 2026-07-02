import { readFileSync } from "node:fs";

import {
  createNodeStrategySweepFilesystem,
  type StrategySweepRunnerDeps,
} from "@/lib/data/research/sweep";
import {
  parseParameterSweepDefinitionJson,
  runParameterStrategySweep,
} from "@/lib/data/research/parameterSweep/index";
import { runHistoricalResearchFromBronze } from "@/lib/data/research/runner";
import { StrategyPluginRegistry } from "@/lib/data/strategies/plugin/StrategyPluginRegistry";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeParameterSweepArgv } from "../lib/cliArgvSchemas";

import { parseHistoricalResearchInputJson } from "./runHistoricalResearch";
import {
  formatStdoutOutput,
  parseConcurrencyFromArgv,
  parseConfigPathFromArgv,
  parseOutputDirFromArgv,
  parseRegistryDirFromArgv,
  parseSummaryPathFromArgv,
} from "./parameterSweepCommandTypes";
import type { ParameterSweepCommandIo } from "./parameterSweepCommandTypes";

function createProductionDeps(): StrategySweepRunnerDeps {
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

export function runParameterSweepCommand(
  argv: readonly string[],
  io: ParameterSweepCommandIo,
  options?: { deps?: StrategySweepRunnerDeps },
): Promise<number> {
  try {
    const normalizedArgv = normalizeParameterSweepArgv(argv);
    const configPath = parseConfigPathFromArgv(normalizedArgv);
    const registryDir = parseRegistryDirFromArgv(normalizedArgv);
    const outputDir = parseOutputDirFromArgv(normalizedArgv);
    const concurrency = parseConcurrencyFromArgv(normalizedArgv);
    const summaryPath = parseSummaryPathFromArgv(normalizedArgv);
    const definition = parseParameterSweepDefinitionJson(
      io.readFile(configPath).replace(/^\uFEFF/, ""),
    );
    const deps = options?.deps ?? createProductionDeps();

    return runParameterStrategySweep(
      {
        definition,
        registryDir,
        outputDir,
        concurrency,
        summaryPath,
      },
      deps,
    ).then(
      (summary) => {
        io.writeStdout(
          formatStdoutOutput(
            stableStringify({
              summaryPath: summary.summaryPath,
              strategyId: summary.definition.strategyId,
              parameterSetCount: summary.parameterSets.length,
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
          error instanceof Error ? error.message : "Parameter sweep command failed";
        io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
        return 1;
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Parameter sweep command failed";
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return Promise.resolve(1);
  }
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> {
  return runParameterSweepCommand(argv, {
    readFile: (path) => readFileSync(path, "utf8"),
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
  ParameterSweepCommandError,
  formatStdoutOutput,
  parseConcurrencyFromArgv,
  parseConfigPathFromArgv,
  parseOutputDirFromArgv,
  parseRegistryDirFromArgv,
  parseSummaryPathFromArgv,
} from "./parameterSweepCommandTypes";
