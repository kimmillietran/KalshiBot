import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildDefaultHypothesisFailureAnalysisInputPaths,
  buildHypothesisFailureAnalysisReport,
  HypothesisFailureAnalysisError,
  loadHypothesisFailureAnalysisInputs,
  serializeHypothesisFailureAnalysisHtml,
  serializeHypothesisFailureAnalysisReport,
} from "@/lib/data/research/hypothesisFailureAnalysis";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeHypothesisFailureAnalysisArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  HypothesisFailureAnalysisCommandError,
  parseHtmlOutputPathFromArgv,
  parseOutputPathFromArgv,
} from "./buildHypothesisFailureAnalysisTypes";
import type { HypothesisFailureAnalysisCommandIo } from "./buildHypothesisFailureAnalysisTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof HypothesisFailureAnalysisCommandError) {
    return error.message;
  }

  if (error instanceof HypothesisFailureAnalysisError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Hypothesis failure analysis failed";
}

function readOptionalFlag(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      return argv[index + 1];
    }
  }

  return undefined;
}

export function runHypothesisFailureAnalysisCommand(
  argv: readonly string[],
  io: HypothesisFailureAnalysisCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeHypothesisFailureAnalysisArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
    const inputPaths = buildDefaultHypothesisFailureAnalysisInputPaths({
      hypothesisCandidatesPath: readOptionalFlag(normalizedArgv, "--hypothesis-candidates"),
      hypothesisValidationPath: readOptionalFlag(normalizedArgv, "--hypothesis-validation"),
      mispricingAtlasPath: readOptionalFlag(normalizedArgv, "--mispricing-atlas"),
      coverageAwareValidationPath: readOptionalFlag(normalizedArgv, "--coverage-aware-validation"),
      crossValidationPath: readOptionalFlag(normalizedArgv, "--cross-validation"),
      hypothesisHistoryPath: readOptionalFlag(normalizedArgv, "--hypothesis-history"),
    });
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const parsedInputs = loadHypothesisFailureAnalysisInputs(io, inputPaths);
    const report = buildHypothesisFailureAnalysisReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      inputStatus: parsedInputs.inputStatus,
      passThreshold: parsedInputs.passThreshold ?? undefined,
      candidates: parsedInputs.candidates,
      validations: parsedInputs.validations,
      mispricingAtlas: parsedInputs.mispricingAtlas,
      coverageEntries: parsedInputs.coverageEntries,
      crossValidationEntries: parsedInputs.crossValidationEntries,
      hypothesisHistory: parsedInputs.hypothesisHistory,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeHypothesisFailureAnalysisReport(report));
    io.writeFile(htmlOutputPath, serializeHypothesisFailureAnalysisHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          totalHypotheses: report.summary.totalHypotheses,
          failingCount: report.summary.failingCount,
          nearPromisingCount: report.summary.nearPromisingCount,
          highestRobustnessScore: report.summary.highestRobustnessScore,
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
  const exitCode = runHypothesisFailureAnalysisCommand(process.argv.slice(2), {
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

export { HypothesisFailureAnalysisError, HypothesisFailureAnalysisCommandError };
