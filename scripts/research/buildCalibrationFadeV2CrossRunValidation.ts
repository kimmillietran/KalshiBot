import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import { createCalibrationFadeForwardValidationIo } from "@/lib/data/research/calibrationFadeForwardValidation";
import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation/publishResearchArtifactsAtomically";
import {
  analyzeCalibrationFadeV2CrossRun,
  CalibrationFadeV2CrossRunValidationError,
  parseCalibrationFadeV2CrossRunValidationArgv,
  serializeCalibrationFadeV2CrossRunValidationHtml,
  serializeCalibrationFadeV2CrossRunValidationJson,
  serializeJsonl,
} from "@/lib/data/research/calibrationFadeV2CrossRunValidation";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type CalibrationFadeV2CrossRunValidationCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  fileExists: (path: string) => boolean;
  readFile: (path: string) => string;
  unlinkFile: (path: string) => void;
  renameFile: (from: string, to: string) => void;
};

export function formatCommandError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runCalibrationFadeV2CrossRunValidationCommand(
  argv: readonly string[],
  io: CalibrationFadeV2CrossRunValidationCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const config = parseCalibrationFadeV2CrossRunValidationArgv(argv);
    const analysisIo = {
      ...createCalibrationFadeForwardValidationIo(),
      fileExists: io.fileExists,
      readFile: io.readFile,
      writeFile: io.writeFile,
      unlinkFile: io.unlinkFile,
      renameFile: io.renameFile,
    };
    const { report, marketLines, runLines, appearanceLines, outputPaths } =
      analyzeCalibrationFadeV2CrossRun({
        config,
        io: analysisIo,
        generatedAt: options?.generatedAt ?? new Date().toISOString(),
      });

    io.mkdirSync(dirname(outputPaths.outputPath), { recursive: true });
    io.mkdirSync(dirname(outputPaths.htmlOutputPath), { recursive: true });
    io.mkdirSync(dirname(outputPaths.marketsOutputPath), { recursive: true });
    io.mkdirSync(dirname(outputPaths.runsOutputPath), { recursive: true });
    io.mkdirSync(dirname(outputPaths.appearancesOutputPath), { recursive: true });

    publishResearchArtifactsAtomically(io, [
      {
        outputPath: outputPaths.outputPath,
        data: serializeCalibrationFadeV2CrossRunValidationJson(report),
      },
      {
        outputPath: outputPaths.htmlOutputPath,
        data: serializeCalibrationFadeV2CrossRunValidationHtml(report),
      },
      { outputPath: outputPaths.marketsOutputPath, data: serializeJsonl(marketLines) },
      { outputPath: outputPaths.runsOutputPath, data: serializeJsonl(runLines) },
      { outputPath: outputPaths.appearancesOutputPath, data: serializeJsonl(appearanceLines) },
    ]);

    io.writeStdout(
      `${stableStringify({
        analysisVersion: report.analysisVersion,
        runSetHash: report.runSetHash,
        evidenceMode: report.evidenceMode,
        selectedRunIds: report.selectedRunIds,
        uniqueCandidateMarketCount: report.uniqueCandidateMarketCount,
        evaluatedIndependentCandidateMarketCount: report.evaluatedIndependentCandidateMarketCount,
        interpretationClassification: report.interpretationClassification,
        recommendedNextAction: report.recommendedNextAction,
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
      })}\n`,
    );
    return 0;
  } catch (error) {
    io.writeStderr(`${formatCommandError(error)}\n`);
    return error instanceof CalibrationFadeV2CrossRunValidationError ? 1 : 1;
  }
}

async function main(): Promise<void> {
  const exitCode = await runCalibrationFadeV2CrossRunValidationCommand(process.argv.slice(2), {
    writeStdout: (text) => process.stdout.write(text),
    writeStderr: (text) => process.stderr.write(text),
    writeFile: (path, data) => writeFileSync(path, data, "utf8"),
    mkdirSync: (path, options) => mkdirSync(path, options),
    fileExists: (path) => existsSync(path),
    readFile: (path) => readFileSync(path, "utf8"),
    unlinkFile: (path) => unlinkSync(path),
    renameFile: (from, to) => renameSync(from, to),
  });
  process.exitCode = exitCode;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("buildCalibrationFadeV2CrossRunValidation.ts")) {
  void main();
}
