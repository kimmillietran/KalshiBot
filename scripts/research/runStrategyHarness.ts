import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";

import { runHistoricalResearchFromBronze } from "@/lib/data/research/runner";
import {
  resolveHarnessStrategyFromSpec,
  runStrategyHarness,
  StrategyHarnessError,
} from "@/lib/data/research/strategyHarness";
import type { RunStrategyHarnessEvaluationFn } from "@/lib/data/research/strategyHarness";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeStrategyHarnessArgv } from "../lib/cliArgvSchemas";

import { parseHistoricalResearchInputJson } from "./runHistoricalResearch";
import type { HistoricalResearchCliInputDocument } from "./types";
import {
  formatStdoutOutput,
  parseConcurrencyFromArgv,
  parseIncludeRejectedFromArgv,
  parseOutputDirFromArgv,
  parseRegistryDirFromArgv,
  parseStrategyFamilyFromArgv,
  parseSynthesizedStrategyIdFromArgv,
  parseSynthesisPathFromArgv,
  StrategyHarnessCommandError,
} from "./runStrategyHarnessTypes";
import type { StrategyHarnessCommandIo } from "./runStrategyHarnessTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof StrategyHarnessCommandError) {
    return error.message;
  }

  if (error instanceof StrategyHarnessError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Strategy harness failed";
}

function createHarnessIo(io: StrategyHarnessCommandIo) {
  return {
    readFile: io.readFile,
    fileExists: io.fileExists,
    readdir: io.readdir,
    isDirectory: io.isDirectory,
    writeFile: io.writeFile,
    mkdir: (path: string) => {
      io.mkdirSync(path, { recursive: true });
    },
  };
}

function createProductionRunEvaluation(): RunStrategyHarnessEvaluationFn {
  return ({ spec, fixture }) => {
    const strategy = resolveHarnessStrategyFromSpec(spec);
    const result = runHistoricalResearchFromBronze({
      bronzeRecords: fixture.bronzeRecords,
      strategy,
      engineConfig: fixture.engineConfig,
      initialCashCents: fixture.initialCashCents,
      runId: `${fixture.runId}-${spec.strategyId}`,
      durationMs: fixture.durationMs,
      fillConfig: fixture.fillConfig,
      costModelConfig: fixture.costModelConfig,
      metricsConfig: fixture.metricsConfig,
    });

    return result.serialized;
  };
}

export type RunStrategyHarnessCommandOptions = {
  runEvaluation?: RunStrategyHarnessEvaluationFn;
  parseFixtureJson?: (json: string, marketTicker?: string) => HistoricalResearchCliInputDocument;
};

export function runStrategyHarnessCommand(
  argv: readonly string[],
  io: StrategyHarnessCommandIo,
  options?: RunStrategyHarnessCommandOptions,
): Promise<number> {
  try {
    const normalizedArgv = normalizeStrategyHarnessArgv(argv);
    const synthesisPath = parseSynthesisPathFromArgv(normalizedArgv);
    const registryDir = parseRegistryDirFromArgv(normalizedArgv);
    const outputDir = parseOutputDirFromArgv(normalizedArgv);
    const strategyFamily = parseStrategyFamilyFromArgv(normalizedArgv);
    const synthesizedStrategyId = parseSynthesizedStrategyIdFromArgv(normalizedArgv);
    const includeRejected = parseIncludeRejectedFromArgv(normalizedArgv);
    const concurrency = parseConcurrencyFromArgv(normalizedArgv);

    return runStrategyHarness({
      synthesisPath,
      registryDir,
      outputDir,
      strategyFamily,
      synthesizedStrategyId,
      includeRejected,
      concurrency,
      io: createHarnessIo(io),
      parseFixtureJson: options?.parseFixtureJson
        ?? ((json, marketTicker) => {
          try {
            return parseHistoricalResearchInputJson(json);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Invalid fixture";
            throw new Error(
              marketTicker ? `${message} (${marketTicker})` : message,
            );
          }
        }),
      runEvaluation: options?.runEvaluation ?? createProductionRunEvaluation(),
    }).then(
      (summary) => {
        for (const warning of summary.warnings) {
          io.writeStderr(`warning: ${warning}\n`);
        }

        io.writeStdout(
          formatStdoutOutput(
            stableStringify({
              summaryPath: summary.summaryPath,
              outputDir: summary.outputDir,
              evaluatedStrategies: summary.evaluatedStrategies,
              totalRuns: summary.totalRuns,
              successfulRuns: summary.successfulRuns,
              failedRuns: summary.failedRuns,
              skippedRuns: summary.skippedRuns,
              durationMs: summary.durationMs,
              warnings: summary.warnings,
            }),
          ),
        );
        return 0;
      },
      (error: unknown) => {
        io.writeStderr(`${mapCommandError(error)}\n`);
        return 1;
      },
    );
  } catch (error) {
    io.writeStderr(`${mapCommandError(error)}\n`);
    return Promise.resolve(1);
  }
}

function main(): void {
  void runStrategyHarnessCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
    writeFile: (path, data) => {
      writeFileSync(path, data, "utf8");
    },
    mkdirSync: (path, options) => {
      mkdirSync(path, options);
    },
    readdir: (path) => readdirSync(path),
    fileExists: (path) => existsSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  formatStdoutOutput,
  parseConcurrencyFromArgv,
  parseOutputDirFromArgv,
  parseRegistryDirFromArgv,
  parseSynthesisPathFromArgv,
  StrategyHarnessCommandError,
} from "./runStrategyHarnessTypes";
