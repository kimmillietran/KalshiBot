import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import { createCalibrationFadeForwardValidationIo } from "@/lib/data/research/calibrationFadeForwardValidation";
import { stableStringify } from "@/lib/trading/config/hashConfig";
import {
  buildCalibrationFadeV2CaptureReadiness,
  CalibrationFadeV2CaptureReadinessError,
  parseCalibrationFadeV2CaptureReadinessArgv,
  type CalibrationFadeV2CaptureReadinessCliSummary,
} from "@/lib/data/research/calibrationFadeV2CaptureReadiness";

export type CalibrationFadeV2CaptureReadinessCommandIo = {
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

export async function runCalibrationFadeV2CaptureReadinessCommand(
  argv: readonly string[],
  io: CalibrationFadeV2CaptureReadinessCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const parsed = parseCalibrationFadeV2CaptureReadinessArgv(argv);
    const filesystemIo = createCalibrationFadeForwardValidationIo();
    const report = await buildCalibrationFadeV2CaptureReadiness({
      generatedAt: options?.generatedAt ?? new Date().toISOString(),
      config: parsed.config,
      paths: parsed.paths,
      io: {
        ...filesystemIo,
        writeFile: io.writeFile,
        mkdirSync: io.mkdirSync,
        fileExists: io.fileExists,
        readFile: io.readFile,
        unlinkFile: io.unlinkFile,
        renameFile: io.renameFile,
      },
    });

    const summary: CalibrationFadeV2CaptureReadinessCliSummary = {
      selectedRunId: report.selectedRunId,
      verdict: report.verdict,
      confirmatoryEligibility: report.confirmatoryEligibility,
      distinctValidCompletedMinutes: report.distinctValidCompletedMinutes,
      recommendedNextAction: report.recommendedNextAction,
      jsonOutputPath: report.jsonOutputPath,
      htmlOutputPath: report.htmlOutputPath,
    };
    io.writeStdout(`${stableStringify(summary)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof CalibrationFadeV2CaptureReadinessError) {
      io.writeStderr(`${error.message}\n`);
      return 1;
    }
    io.writeStderr(`${formatCommandError(error)}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const filesystemIo = createCalibrationFadeForwardValidationIo();
  const exitCode = await runCalibrationFadeV2CaptureReadinessCommand(process.argv.slice(2), {
    writeStdout: (text) => process.stdout.write(text),
    writeStderr: (text) => process.stderr.write(text),
    writeFile: (path, data) => writeFileSync(path, data, "utf8"),
    mkdirSync: (path, options) => mkdirSync(path, options),
    fileExists: (path) => existsSync(path),
    readFile: (path) => filesystemIo.readFile(path),
    unlinkFile: (path) => unlinkSync(path),
    renameFile: (from, to) => renameSync(from, to),
  });
  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  void main();
}
