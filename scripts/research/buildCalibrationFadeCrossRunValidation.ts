import { dirname } from "node:path";
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import {
  buildCalibrationFadeCrossRunValidationReport,
  CalibrationFadeCrossRunValidationError,
  createCalibrationFadeCrossRunValidationIo,
  parseCalibrationFadeCrossRunValidationArgv,
  serializeCalibrationFadeCrossRunValidationHtml,
  serializeCalibrationFadeCrossRunValidationReport,
} from "@/lib/data/research/calibrationFadeCrossRunValidation";
import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type CalibrationFadeCrossRunValidationCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  fileExists: (path: string) => boolean;
  unlinkFile: (path: string) => void;
  renameFile: (from: string, to: string) => void;
};

function formatCommandError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runCalibrationFadeCrossRunValidationCommand(
  argv: readonly string[],
  io: CalibrationFadeCrossRunValidationCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const { outputPath, htmlOutputPath, hypothesisId, config } =
      parseCalibrationFadeCrossRunValidationArgv(argv);
    const { report, marketLines, runLines, appearanceLines } =
      await buildCalibrationFadeCrossRunValidationReport({
        generatedAt: options?.generatedAt ?? new Date().toISOString(),
        outputPath,
        htmlOutputPath,
        config,
        hypothesisId: hypothesisId ?? undefined,
        io: createCalibrationFadeCrossRunValidationIo(),
      });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.mkdirSync(dirname(config.marketsOutputPath), { recursive: true });
    io.mkdirSync(dirname(config.runsOutputPath), { recursive: true });
    io.mkdirSync(dirname(config.appearancesOutputPath), { recursive: true });

    publishResearchArtifactsAtomically(io, [
      { outputPath, data: serializeCalibrationFadeCrossRunValidationReport(report) },
      { outputPath: htmlOutputPath, data: serializeCalibrationFadeCrossRunValidationHtml(report) },
      {
        outputPath: config.marketsOutputPath,
        data: `${marketLines.join("\n")}${marketLines.length ? "\n" : ""}`,
      },
      {
        outputPath: config.runsOutputPath,
        data: `${runLines.join("\n")}${runLines.length ? "\n" : ""}`,
      },
      {
        outputPath: config.appearancesOutputPath,
        data: `${appearanceLines.join("\n")}${appearanceLines.length ? "\n" : ""}`,
      },
    ]);

    io.writeStdout(
      `${stableStringify({
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
        analysisScope: report.analysisScope,
        runSetHash: report.runSetHash,
        selectedRunIds: report.selectedRunIds,
        hypothesisId: report.hypothesisId,
        hypothesisConfigurationHash: report.hypothesisConfigurationHash,
        uniqueCandidateMarketCount: report.uniqueCandidateMarketCount,
        classification: report.classification,
        recommendedNextAction: report.recommendedNextAction,
      })}\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof CalibrationFadeCrossRunValidationError) {
      io.writeStderr(`${error.message}\n`);
      return 1;
    }
    io.writeStderr(`${formatCommandError(error)}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const exitCode = await runCalibrationFadeCrossRunValidationCommand(process.argv.slice(2), {
    writeStdout: (text) => process.stdout.write(text),
    writeStderr: (text) => process.stderr.write(text),
    writeFile: (path, data) => writeFileSync(path, data, "utf8"),
    mkdirSync: (path, options) => mkdirSync(path, options),
    fileExists: (path) => existsSync(path),
    unlinkFile: (path) => unlinkSync(path),
    renameFile: (from, to) => renameSync(from, to),
  });
  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  void main();
}
