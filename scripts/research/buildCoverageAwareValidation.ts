import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildCoverageAwareValidationReport,
  buildDefaultCoverageAwareValidationInputPaths,
  CoverageAwareValidationError,
  loadCoverageAwareValidationInputs,
  serializeCoverageAwareValidationHtml,
  serializeCoverageAwareValidationReport,
} from "@/lib/data/research/coverageAwareValidation";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeCoverageAwareValidationArgv } from "../lib/cliArgvSchemas";

import {
  CoverageAwareValidationCommandError,
  formatStdoutOutput,
  parseHtmlOutputPathFromArgv,
  parseOutputPathFromArgv,
} from "./buildCoverageAwareValidationTypes";
import type { CoverageAwareValidationCommandIo } from "./buildCoverageAwareValidationTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof CoverageAwareValidationCommandError) {
    return error.message;
  }

  if (error instanceof CoverageAwareValidationError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Coverage-aware validation failed";
}

function readOptionalFlag(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      return argv[index + 1];
    }
  }

  return undefined;
}

export function runCoverageAwareValidationCommand(
  argv: readonly string[],
  io: CoverageAwareValidationCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeCoverageAwareValidationArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
    const inputPaths = buildDefaultCoverageAwareValidationInputPaths({
      hypothesisValidationPath: readOptionalFlag(normalizedArgv, "--hypothesis-validation"),
      crossValidationPath: readOptionalFlag(normalizedArgv, "--cross-validation"),
      historicalCoveragePlanPath: readOptionalFlag(normalizedArgv, "--historical-coverage-plan"),
      hypothesisCandidatesPath: readOptionalFlag(normalizedArgv, "--hypothesis-candidates"),
    });
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const parsedInputs = loadCoverageAwareValidationInputs(io, inputPaths);
    const report = buildCoverageAwareValidationReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      candidates: parsedInputs.candidates,
      validations: parsedInputs.validations,
      crossValidationEntries: parsedInputs.crossValidationEntries,
      coveragePlan: parsedInputs.coveragePlan,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeCoverageAwareValidationReport(report));
    io.writeFile(htmlOutputPath, serializeCoverageAwareValidationHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          totalHypotheses: report.summary.totalHypotheses,
          rejectedCount: report.summary.rejectedCount,
          inconclusiveInsufficientCoverageCount:
            report.summary.inconclusiveInsufficientCoverageCount,
          robustEnoughToTestCount: report.summary.robustEnoughToTestCount,
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
  const exitCode = runCoverageAwareValidationCommand(process.argv.slice(2), {
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
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export { CoverageAwareValidationError, CoverageAwareValidationCommandError };
