import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildDefaultHypothesisRefinementInputPaths,
  buildHypothesisRefinementReport,
  HypothesisRefinementError,
  loadHypothesisRefinementInputs,
  serializeHypothesisRefinementReport,
  serializeHypothesisRefinementsHtml,
} from "@/lib/data/research/hypothesisRefinementGenerator";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeHypothesisRefinementsArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  HypothesisRefinementCommandError,
  parseHtmlOutputPathFromArgv,
  parseOutputPathFromArgv,
} from "./buildHypothesisRefinementsTypes";
import type { HypothesisRefinementCommandIo } from "./buildHypothesisRefinementsTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof HypothesisRefinementCommandError) {
    return error.message;
  }

  if (error instanceof HypothesisRefinementError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Hypothesis refinement generation failed";
}

function readOptionalFlag(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      return argv[index + 1];
    }
  }

  return undefined;
}

export function runHypothesisRefinementsCommand(
  argv: readonly string[],
  io: HypothesisRefinementCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeHypothesisRefinementsArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
    const inputPaths = buildDefaultHypothesisRefinementInputPaths({
      hypothesisFailureAnalysisPath: readOptionalFlag(
        normalizedArgv,
        "--hypothesis-failure-analysis",
      ),
      hypothesisValidationPath: readOptionalFlag(normalizedArgv, "--hypothesis-validation"),
      mispricingAtlasPath: readOptionalFlag(normalizedArgv, "--mispricing-atlas"),
      crossValidationPath: readOptionalFlag(normalizedArgv, "--cross-validation"),
    });
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const parsedInputs = loadHypothesisRefinementInputs(io, inputPaths);
    const report = buildHypothesisRefinementReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      inputStatus: parsedInputs.inputStatus,
      failureAnalyses: parsedInputs.failureAnalyses,
      validations: parsedInputs.validations,
      mispricingAtlas: parsedInputs.mispricingAtlas,
      crossValidationEntries: parsedInputs.crossValidationEntries,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeHypothesisRefinementReport(report));
    io.writeFile(htmlOutputPath, serializeHypothesisRefinementsHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          totalRefinements: report.summary.totalRefinements,
          parentsWithRefinements: report.summary.parentsWithRefinements,
          nearPromisingParents: report.summary.nearPromisingParents,
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
  const exitCode = runHypothesisRefinementsCommand(process.argv.slice(2), {
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

export { HypothesisRefinementError, HypothesisRefinementCommandError };
