import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildDefaultResearchRoiAnalysisInputPaths,
  buildResearchRoiAnalysisReport,
  loadResearchRoiAnalysisInputs,
  ResearchRoiAnalysisError,
  serializeResearchRoiAnalysisHtml,
  serializeResearchRoiAnalysisReport,
} from "@/lib/data/research/researchRoiAnalysis";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeResearchRoiAnalysisArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  ResearchRoiAnalysisCommandError,
  parseHtmlOutputPathFromArgv,
  parseOutputPathFromArgv,
} from "./buildResearchRoiAnalysisTypes";
import type { ResearchRoiAnalysisCommandIo } from "./buildResearchRoiAnalysisTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof ResearchRoiAnalysisCommandError) {
    return error.message;
  }

  if (error instanceof ResearchRoiAnalysisError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Research ROI analysis failed";
}

function readOptionalFlag(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      return argv[index + 1];
    }
  }

  return undefined;
}

export function runResearchRoiAnalysisCommand(
  argv: readonly string[],
  io: ResearchRoiAnalysisCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeResearchRoiAnalysisArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
    const inputPaths = buildDefaultResearchRoiAnalysisInputPaths({
      hypothesisCandidatesPath: readOptionalFlag(normalizedArgv, "--hypothesis-candidates"),
      hypothesisValidationPath: readOptionalFlag(normalizedArgv, "--hypothesis-validation"),
      hypothesisFailureAnalysisPath: readOptionalFlag(
        normalizedArgv,
        "--hypothesis-failure-analysis",
      ),
      hypothesisRefinementsPath: readOptionalFlag(normalizedArgv, "--hypothesis-refinements"),
      refinementHypothesisCandidatesPath: readOptionalFlag(
        normalizedArgv,
        "--refinement-hypothesis-candidates",
      ),
      mispricingAtlasPath: readOptionalFlag(normalizedArgv, "--mispricing-atlas"),
    });
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const parsedInputs = loadResearchRoiAnalysisInputs(io, inputPaths);
    const report = buildResearchRoiAnalysisReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      inputStatus: parsedInputs.inputStatus,
      candidates: parsedInputs.candidates,
      validations: parsedInputs.validations,
      failureAnalyses: parsedInputs.failureAnalyses,
      refinements: parsedInputs.refinements,
      mispricingAtlas: parsedInputs.mispricingAtlas,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeResearchRoiAnalysisReport(report));
    io.writeFile(htmlOutputPath, serializeResearchRoiAnalysisHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath,
          htmlOutputPath,
          overallRoiScore: report.summary.overall.overallRoiScore,
          totalCandidates: report.summary.overall.totalCandidates,
          validatedCandidates: report.summary.overall.validatedCandidates,
          nearPromisingCandidates: report.summary.overall.nearPromisingCandidates,
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
  const io: ResearchRoiAnalysisCommandIo = {
    readFile: (path) => readFileSync(path, "utf8"),
    writeStdout: (text) => process.stdout.write(text),
    writeStderr: (text) => process.stderr.write(text),
    writeFile: (path, data) => writeFileSync(path, data, "utf8"),
    mkdirSync: (path, options) => {
      if (!existsSync(path)) {
        mkdirSync(path, options);
      }
    },
    fileExists: (path) => existsSync(path),
  };

  process.exit(runResearchRoiAnalysisCommand(process.argv.slice(2), io));
}

if (require.main === module) {
  main();
}
