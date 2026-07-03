import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  buildHarnessResultsReport,
  HarnessResultsError,
  loadHarnessResultsInputs,
  serializeHarnessResultsHtml,
  serializeHarnessResultsReport,
} from "@/lib/data/research/harnessResults";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeHarnessResultsArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseHtmlOutputPathFromArgv,
  parseInputPathsFromArgv,
  parseOutputPathFromArgv,
} from "./buildHarnessResultsTypes";
import type { HarnessResultsCommandIo } from "./buildHarnessResultsTypes";

function mapHarnessCommandError(error: unknown): string {
  if (error instanceof HarnessResultsError) {
    return error.message;
  }

  return mapCommandError(error);
}

export function runHarnessResultsCommand(
  argv: readonly string[],
  io: HarnessResultsCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeHarnessResultsArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
    const inputPaths = parseInputPathsFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const loaded = loadHarnessResultsInputs(io, {
      synthesisPath: inputPaths.synthesisPath,
      harnessSummaryPath: inputPaths.harnessSummaryPath,
      hypothesisValidationPath: inputPaths.hypothesisValidationPath,
      strategyLeaderboardPath: inputPaths.strategyLeaderboardPath,
    });

    const report = buildHarnessResultsReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths: {
        synthesisPath: inputPaths.synthesisPath,
        harnessSummaryPath: inputPaths.harnessSummaryPath,
        harnessOutputDir: inputPaths.harnessOutputDir,
        hypothesisValidationPath: inputPaths.hypothesisValidationPath,
        strategyLeaderboardPath: inputPaths.strategyLeaderboardPath,
      },
      synthesisStrategies: loaded.synthesisStrategies,
      harnessSummary: loaded.harnessSummary,
      validationByHypothesisId: loaded.validationByHypothesisId,
      leaderboardStrategyIds: loaded.leaderboardStrategyIds,
      readFile: io.readFile,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeHarnessResultsReport(report));
    io.writeFile(htmlOutputPath, serializeHarnessResultsHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          totalStrategies: report.summary.totalStrategies,
          recommendationCounts: report.summary.recommendationCounts,
        }),
      ),
    );

    return 0;
  } catch (error) {
    io.writeStderr(`${mapHarnessCommandError(error)}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runHarnessResultsCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
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
  parseHtmlOutputPathFromArgv,
  parseInputPathsFromArgv,
  parseOutputPathFromArgv,
} from "./buildHarnessResultsTypes";
