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
  buildHistoricalExpansionImportConfig,
  collectCoveredWindowsFromImportConfigs,
  ExpansionConfigError,
  loadHistoricalCoveragePlan,
  serializeHistoricalExpansionConfigHtml,
  serializeHistoricalExpansionImportConfig,
} from "@/lib/data/importJobs/expansionConfig";

import { normalizeGenerateExpansionImportConfigArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  GenerateExpansionImportConfigCommandError,
  parseDryRunFromArgv,
  parseHtmlOutputPathFromArgv,
  parseImportConfigsDirFromArgv,
  parseInputPathFromArgv,
  parseOutputPathFromArgv,
} from "./generateExpansionImportConfigTypes";
import type { GenerateExpansionImportConfigCommandIo } from "./generateExpansionImportConfigTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof GenerateExpansionImportConfigCommandError) {
    return error.message;
  }

  if (error instanceof ExpansionConfigError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Expansion import config generation failed";
}

export function runGenerateExpansionImportConfigCommand(
  argv: readonly string[],
  io: GenerateExpansionImportConfigCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeGenerateExpansionImportConfigArgv(argv);
    const inputPath = parseInputPathFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
    const importConfigsDir = parseImportConfigsDirFromArgv(normalizedArgv);
    const dryRun = parseDryRunFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const plan = loadHistoricalCoveragePlan(io.readFile, io.fileExists, inputPath);
    const existingCoveredWindows = collectCoveredWindowsFromImportConfigs(
      importConfigsDir,
      io,
    );

    const config = buildHistoricalExpansionImportConfig({
      plan,
      inputPath,
      outputPath,
      importConfigsDir,
      generatedAt,
      dryRun,
      existingCoveredWindows,
    });

    const serializedConfig = serializeHistoricalExpansionImportConfig(config);
    const serializedHtml = serializeHistoricalExpansionConfigHtml(config);

    if (!dryRun) {
      io.mkdirSync(dirname(outputPath), { recursive: true });
      io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
      io.writeFile(outputPath, serializedConfig);
      io.writeFile(htmlOutputPath, serializedHtml);
    }

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          dryRun,
          inputPath,
          outputPath,
          htmlOutputPath,
          recommendationCount: config.summary.recommendationCount,
          scheduledJobCount: config.summary.scheduledJobCount,
          skippedJobCount: config.summary.skippedJobCount,
          jobs: config.jobs.map((job) => ({
            jobId: job.jobId,
            priority: job.priority,
            status: job.status,
            windowStart: job.windowStart,
            windowEnd: job.windowEnd,
            estimatedMarketCount: job.estimatedMarketCount,
          })),
        }),
      ),
    );

    return 0;
  } catch (error) {
    io.writeStderr(`${mapCommandError(error)}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runGenerateExpansionImportConfigCommand(process.argv.slice(2), {
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

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  formatStdoutOutput,
  GenerateExpansionImportConfigCommandError,
  parseDryRunFromArgv,
  parseHtmlOutputPathFromArgv,
  parseImportConfigsDirFromArgv,
  parseInputPathFromArgv,
  parseOutputPathFromArgv,
  parseWriteFromArgv,
} from "./generateExpansionImportConfigTypes";
