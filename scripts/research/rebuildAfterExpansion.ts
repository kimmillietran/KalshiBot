import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";

import {
  buildDefaultBatchFixtureBridgeOptions,
} from "@/lib/data/importJobs/batchFixtureBridge/buildDefaultBatchFixtureBridgeOptions";
import { parseHistoricalBronzeImportResultJson } from "@/lib/data/importJobs/batchFixtureBridge/parseHistoricalBronzeImportResultJson";
import { serializeHistoricalResearchFixtureFromImportResult } from "@/lib/data/importJobs/fixtureBridge";
import {
  ExpansionRebuildError,
  runExpansionRebuild,
  serializeExpansionRebuildSummary,
  serializeExpansionRebuildSummaryHtml,
} from "@/lib/data/research/expansionRebuild";
import { runHistoricalResearchFromBronze } from "@/lib/data/research/runner";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeRebuildAfterExpansionArgv } from "../lib/cliArgvSchemas";

import { parseHistoricalResearchInputJson } from "./runHistoricalResearch";
import { resolveBuiltinStrategy } from "./types";
import {
  formatStdoutOutput,
  parseConcurrencyFromArgv,
  parseFixturesDirFromArgv,
  parseFullRebuildFromArgv,
  parseHtmlOutputPathFromArgv,
  parseImportConfigsDirFromArgv,
  parseImportsDirFromArgv,
  parseInputPathFromArgv,
  parseMispricingAtlasPathFromArgv,
  parseOutputPathFromArgv,
  parseRegistryDirFromArgv,
  parseResearchResultsDirFromArgv,
  RebuildAfterExpansionCommandError,
} from "./rebuildAfterExpansionTypes";
import type { RebuildAfterExpansionCommandIo } from "./rebuildAfterExpansionTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof RebuildAfterExpansionCommandError) {
    return error.message;
  }

  if (error instanceof ExpansionRebuildError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Expansion rebuild command failed";
}

export function runRebuildAfterExpansionCommand(
  argv: readonly string[],
  io: RebuildAfterExpansionCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const normalizedArgv = normalizeRebuildAfterExpansionArgv(argv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const input = {
      expansionImportSummaryPath: parseInputPathFromArgv(normalizedArgv),
      fixturesDir: parseFixturesDirFromArgv(normalizedArgv),
      importsDir: parseImportsDirFromArgv(normalizedArgv),
      importConfigsDir: parseImportConfigsDirFromArgv(normalizedArgv),
      metadataDir: null,
      registryDir: parseRegistryDirFromArgv(normalizedArgv),
      researchResultsDir: parseResearchResultsDirFromArgv(normalizedArgv),
      mispricingAtlasPath: parseMispricingAtlasPathFromArgv(normalizedArgv),
      outputPath: parseOutputPathFromArgv(normalizedArgv),
      htmlOutputPath: parseHtmlOutputPathFromArgv(normalizedArgv),
      fullRebuild: parseFullRebuildFromArgv(normalizedArgv),
      concurrency: parseConcurrencyFromArgv(normalizedArgv),
      generatedAt,
    };

    return runExpansionRebuild(
      input,
      {
        readdir: (path) => io.readdir(path),
        readFile: (path) => io.readFile(path),
        fileExists: (path) => io.fileExists(path),
        isDirectory: (path) => io.isDirectory(path),
        writeFile: (path, data) => io.writeFile(path, data),
        mkdirSync: (path, options) => io.mkdirSync(path, options),
      },
      {
        parseImportResultJson: parseHistoricalBronzeImportResultJson,
        runFixtureBridge: ({ importResult, marketTicker }) =>
          serializeHistoricalResearchFixtureFromImportResult({
            importResult,
            ...buildDefaultBatchFixtureBridgeOptions(marketTicker),
          }),
        parseFixtureJson: (json, marketTicker) => {
          try {
            return parseHistoricalResearchInputJson(json);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Invalid fixture";
            throw new Error(marketTicker ? `${message} (${marketTicker})` : message);
          }
        },
        runResearch: ({ fixture }) => {
          const result = runHistoricalResearchFromBronze({
            bronzeRecords: fixture.bronzeRecords,
            strategy: resolveBuiltinStrategy(fixture.strategyId, fixture.strategyConfig),
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
      },
    ).then(
      (summary) => {
        io.mkdirSync(dirname(input.outputPath), { recursive: true });
        io.mkdirSync(dirname(input.htmlOutputPath), { recursive: true });
        io.writeFile(input.outputPath, serializeExpansionRebuildSummary(summary));
        io.writeFile(input.htmlOutputPath, serializeExpansionRebuildSummaryHtml(summary));

        io.writeStdout(
          formatStdoutOutput(
            stableStringify({
              outputPath: summary.outputPath,
              htmlOutputPath: summary.htmlOutputPath,
              targetMarketCount: summary.targetMarketCount,
              fixturesBuilt: summary.summary.fixturesBuilt,
              fixturesFailed: summary.summary.fixturesFailed,
              researchRunsSucceeded: summary.summary.researchRunsSucceeded,
              researchRunsFailed: summary.summary.researchRunsFailed,
              before: summary.before,
              after: summary.after,
            }),
          ),
        );

        const hasFailures =
          summary.summary.fixturesFailed > 0 || summary.summary.researchRunsFailed > 0;

        return hasFailures ? 1 : 0;
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

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  return runRebuildAfterExpansionCommand(argv, {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
    readdir: (path) => readdirSync(path),
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
  });
}

if (process.env.VITEST !== "true") {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
