import { dirname } from "node:path";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

import {
  buildOosPowerCorrectionReport,
  serializeOosPowerCorrectionHtml,
  serializeOosPowerCorrectionReport,
} from "@/lib/data/research/oosPowerCorrection";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeOosPowerCorrectionArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseOosPowerCorrectionConfigFromArgv,
} from "./buildOosPowerCorrectionTypes";
import type { OosPowerCorrectionCommandIo } from "./buildOosPowerCorrectionTypes";

export function runOosPowerCorrectionCommand(
  argv: readonly string[],
  io: OosPowerCorrectionCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeOosPowerCorrectionArgv(argv);
    const config = parseOosPowerCorrectionConfigFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildOosPowerCorrectionReport({
      generatedAt,
      outputPath: config.outputPath,
      htmlOutputPath: config.htmlOutputPath,
      inputPaths: config.inputPaths,
      config: config.config,
      io: {
        readFile: io.readFile,
        fileExists: io.fileExists,
        readdir: io.readdir,
        isDirectory: io.isDirectory,
      },
    });

    io.mkdirSync(dirname(config.outputPath), { recursive: true });
    io.mkdirSync(dirname(config.htmlOutputPath), { recursive: true });
    io.writeFile(config.outputPath, serializeOosPowerCorrectionReport(report));
    io.writeFile(config.htmlOutputPath, serializeOosPowerCorrectionHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          candidateCount: report.summary.candidateCount,
          passesCorrectedCount: report.summary.passesCorrectedCount,
          underpoweredCount: report.summary.underpoweredCount,
          finalPassCount: report.summary.finalPassCount,
          correctionMethod: report.summary.correctionMethod,
          trainMonths: report.splitSummary.trainMonths,
          holdoutMonths: report.splitSummary.holdoutMonths,
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
  const exitCode = runOosPowerCorrectionCommand(process.argv.slice(2), {
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
