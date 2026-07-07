import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";

import {
  buildDefaultDerivedSettlementSensitivityInputPaths,
  buildDerivedSettlementSensitivityReport,
  DerivedSettlementSensitivityError,
  loadDerivedSettlementSensitivityComputation,
  serializeDerivedSettlementSensitivityHtml,
  serializeDerivedSettlementSensitivityReport,
} from "@/lib/data/research/derivedSettlementSensitivity";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeDerivedSettlementSensitivityArgv } from "../lib/cliArgvSchemas";

import {
  DerivedSettlementSensitivityCommandError,
  formatStdoutOutput,
  parseHtmlOutputPathFromArgv,
  parseOutputPathFromArgv,
} from "./buildDerivedSettlementSensitivityTypes";
import type { DerivedSettlementSensitivityCommandIo } from "./buildDerivedSettlementSensitivityTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof DerivedSettlementSensitivityCommandError) {
    return error.message;
  }

  if (error instanceof DerivedSettlementSensitivityError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Derived settlement sensitivity audit failed";
}

function readOptionalFlag(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      return argv[index + 1];
    }
  }

  return undefined;
}

export function runDerivedSettlementSensitivityCommand(
  argv: readonly string[],
  io: DerivedSettlementSensitivityCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeDerivedSettlementSensitivityArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
    const inputPaths = buildDefaultDerivedSettlementSensitivityInputPaths({
      hypothesisCandidatesPath: readOptionalFlag(normalizedArgv, "--hypothesis-candidates"),
      hypothesisValidationPath: readOptionalFlag(normalizedArgv, "--hypothesis-validation"),
      researchResultsDir: readOptionalFlag(normalizedArgv, "--research-results-dir"),
      regimeTagsPath: readOptionalFlag(normalizedArgv, "--regime-tags"),
    });
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const computation = loadDerivedSettlementSensitivityComputation({ io, inputPaths });
    const report = buildDerivedSettlementSensitivityReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      inputStatus: computation.inputStatus,
      passThreshold: computation.passThreshold,
      candidates: computation.candidates,
      validations: computation.validations,
      derivedMarketKeys: computation.derivedMarketKeys,
      officialOnlyValidations: computation.officialOnlyValidations,
      allCalibrationByHypothesisId: computation.allCalibrationByHypothesisId,
      officialOnlyCalibrationByHypothesisId: computation.officialOnlyCalibrationByHypothesisId,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeDerivedSettlementSensitivityReport(report));
    io.writeFile(htmlOutputPath, serializeDerivedSettlementSensitivityHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          totalHypotheses: report.summary.totalHypotheses,
          hypothesesAffectedCount: report.summary.hypothesesAffectedCount,
          derivedMarketCount: report.derivedMarketCount,
          largestRobustnessDrop: report.summary.largestRobustnessDrop,
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
  const exitCode = runDerivedSettlementSensitivityCommand(process.argv.slice(2), {
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
    fileExists: (path) => existsSync(path),
    readdir: (path) => readdirSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export { DerivedSettlementSensitivityError, DerivedSettlementSensitivityCommandError };
