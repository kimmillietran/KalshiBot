import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";

import {
  buildMonthRegimeAnalysisReport,
  serializeMonthRegimeAnalysisHtml,
  serializeMonthRegimeAnalysisReport,
} from "@/lib/data/research/monthRegimeAnalysis";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeMonthRegimeAnalysisArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseMonthRegimeAnalysisConfigFromArgv,
} from "./buildMonthRegimeAnalysisTypes";
import type { MonthRegimeAnalysisCommandIo } from "./buildMonthRegimeAnalysisTypes";

export function runMonthRegimeAnalysisCommand(
  argv: readonly string[],
  io: MonthRegimeAnalysisCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeMonthRegimeAnalysisArgv(argv);
    const config = parseMonthRegimeAnalysisConfigFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildMonthRegimeAnalysisReport({
      generatedAt,
      outputPath: config.outputPath,
      htmlOutputPath: config.htmlOutputPath,
      inputPaths: config.inputPaths,
      io: {
        readFile: io.readFile,
        fileExists: io.fileExists,
        readdir: io.readdir,
        isDirectory: io.isDirectory,
      },
    });

    io.mkdirSync(dirname(config.outputPath), { recursive: true });
    io.mkdirSync(dirname(config.htmlOutputPath), { recursive: true });
    io.writeFile(config.outputPath, serializeMonthRegimeAnalysisReport(report));
    io.writeFile(config.htmlOutputPath, serializeMonthRegimeAnalysisHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          totalHypotheses: report.summary.totalHypotheses,
          unstableCount: report.summary.unstableCount,
          averageInstabilityIndex: report.summary.averageInstabilityIndex,
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
  const exitCode = runMonthRegimeAnalysisCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
    readdir: (path) => readdirSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
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
