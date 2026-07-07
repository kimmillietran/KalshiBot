import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildDefaultRefinementHypothesisRegistrationInputPaths,
  buildRefinementHypothesisCandidatesReport,
  loadRefinementHypothesisRegistrationInputs,
  RefinementHypothesisRegistrationError,
  serializeRefinementHypothesisCandidatesHtml,
  serializeRefinementHypothesisCandidatesReport,
} from "@/lib/data/research/refinementHypothesisRegistration";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeRegisterRefinementHypothesesArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  parseHtmlOutputPathFromArgv,
  parseOutputPathFromArgv,
  RegisterRefinementHypothesesCommandError,
} from "./registerRefinementHypothesesTypes";
import type { RegisterRefinementHypothesesCommandIo } from "./registerRefinementHypothesesTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof RegisterRefinementHypothesesCommandError) {
    return error.message;
  }

  if (error instanceof RefinementHypothesisRegistrationError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Refinement hypothesis registration failed";
}

function readOptionalFlag(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      return argv[index + 1];
    }
  }

  return undefined;
}

export function runRegisterRefinementHypothesesCommand(
  argv: readonly string[],
  io: RegisterRefinementHypothesesCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeRegisterRefinementHypothesesArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
    const inputPaths = buildDefaultRefinementHypothesisRegistrationInputPaths({
      hypothesisRefinementsPath: readOptionalFlag(normalizedArgv, "--hypothesis-refinements"),
      hypothesisCandidatesPath: readOptionalFlag(normalizedArgv, "--hypothesis-candidates"),
      hypothesisFailureAnalysisPath: readOptionalFlag(normalizedArgv, "--hypothesis-failure-analysis"),
    });
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const parsedInputs = loadRefinementHypothesisRegistrationInputs(io, inputPaths);
    const report = buildRefinementHypothesisCandidatesReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      inputStatus: parsedInputs.inputStatus,
      refinements: parsedInputs.refinements,
      parentCandidates: parsedInputs.parentCandidates,
      generatedFromFailureAnalysis: parsedInputs.generatedFromFailureAnalysis,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeRefinementHypothesisCandidatesReport(report));
    io.writeFile(htmlOutputPath, serializeRefinementHypothesisCandidatesHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          registeredCount: report.summary.registeredCount,
          duplicateSuppressedCount: report.summary.duplicateSuppressedCount,
          skippedMalformedCount: report.summary.skippedMalformedCount,
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
  const exitCode = runRegisterRefinementHypothesesCommand(process.argv.slice(2), {
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

export { RefinementHypothesisRegistrationError, RegisterRefinementHypothesesCommandError };
