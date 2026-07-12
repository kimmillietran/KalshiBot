import { dirname } from "node:path";
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import {
  buildCalibrationFadeForwardValidationReport,
  CalibrationFadeForwardValidationError,
  createCalibrationFadeForwardValidationIo,
  parseCalibrationFadeForwardValidationArgv,
  publishResearchArtifactsAtomically,
  serializeCalibrationFadeForwardValidationHtml,
  serializeCalibrationFadeForwardValidationReport,
} from "@/lib/data/research/calibrationFadeForwardValidation";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type CalibrationFadeForwardValidationCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  fileExists: (path: string) => boolean;
  unlinkFile: (path: string) => void;
  renameFile: (from: string, to: string) => void;
};

export function formatCommandError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runCalibrationFadeForwardValidationCommand(
  argv: readonly string[],
  io: CalibrationFadeForwardValidationCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const { outputPath, htmlOutputPath, hypothesisId, config } = parseCalibrationFadeForwardValidationArgv(argv);
    const { report, eventLines, marketLines } = await buildCalibrationFadeForwardValidationReport({
      generatedAt: options?.generatedAt ?? new Date().toISOString(),
      outputPath,
      htmlOutputPath,
      config,
      hypothesisId: hypothesisId ?? undefined,
      io: createCalibrationFadeForwardValidationIo(),
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    publishResearchArtifactsAtomically(io, [
      { outputPath, data: serializeCalibrationFadeForwardValidationReport(report) },
      { outputPath: htmlOutputPath, data: serializeCalibrationFadeForwardValidationHtml(report) },
      { outputPath: config.eventsOutputPath, data: `${eventLines.join("\n")}${eventLines.length ? "\n" : ""}` },
      { outputPath: config.marketsOutputPath, data: `${marketLines.join("\n")}${marketLines.length ? "\n" : ""}` },
    ]);

    io.writeStdout(
      `${stableStringify({
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
        analysisScope: report.analysisScope,
        selectedRunId: report.selectedRunId,
        hypothesisId: report.hypothesisId,
        hypothesisConfigurationHash: report.hypothesisConfigurationHash,
        candidateMarketCount: report.candidateMarketCount,
        interpretationClassification: report.summary.interpretationClassification,
        recommendedNextAction: report.summary.recommendedNextAction,
      })}\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof CalibrationFadeForwardValidationError) {
      io.writeStderr(`${error.message}\n`);
      return 1;
    }
    io.writeStderr(`${formatCommandError(error)}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const exitCode = await runCalibrationFadeForwardValidationCommand(process.argv.slice(2), {
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
