import { dirname } from "node:path";
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import { createCalibrationFadeForwardValidationIo } from "@/lib/data/research/calibrationFadeForwardValidation";
import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation/publishResearchArtifactsAtomically";
import { stableStringify } from "@/lib/trading/config/hashConfig";
import {
  analyzeCalibrationFadeV2ForwardForRun,
  assertCompleteV2EvidenceIdentity,
  assertV2PublishIdentityCompatible,
  CalibrationFadeV2ForwardValidationError,
  parseCalibrationFadeV2ForwardValidationArgv,
  serializeCalibrationFadeV2ForwardEventsJsonl,
  serializeCalibrationFadeV2ForwardMarketsJsonl,
  serializeCalibrationFadeV2ForwardValidationHtml,
  serializeCalibrationFadeV2ForwardValidationJson,
} from "@/lib/data/research/calibrationFadeV2ForwardValidation";

export type CalibrationFadeV2ForwardValidationCommandIo = {
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

export async function runCalibrationFadeV2ForwardValidationCommand(
  argv: readonly string[],
  io: CalibrationFadeV2ForwardValidationCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const parsed = parseCalibrationFadeV2ForwardValidationArgv(argv);
    const paths = {
      outputPath: parsed.outputPath,
      htmlOutputPath: parsed.htmlOutputPath,
      eventsOutputPath: parsed.eventsOutputPath,
      marketsOutputPath: parsed.marketsOutputPath,
    };
    const { report, eventLines, marketLines, evidenceIdentity } =
      await analyzeCalibrationFadeV2ForwardForRun({
        generatedAt: options?.generatedAt ?? new Date().toISOString(),
        paths,
        config: parsed.config,
        hypothesisId: parsed.hypothesisId ?? undefined,
        io: createCalibrationFadeForwardValidationIo(),
      });

    assertCompleteV2EvidenceIdentity(evidenceIdentity);
    assertV2PublishIdentityCompatible({
      io: {
        ...createCalibrationFadeForwardValidationIo(),
        fileExists: io.fileExists,
        readFile: io.readFile,
      },
      path: paths.outputPath,
      identity: evidenceIdentity,
    });

    io.mkdirSync(dirname(paths.outputPath), { recursive: true });
    io.mkdirSync(dirname(paths.htmlOutputPath), { recursive: true });
    publishResearchArtifactsAtomically(io, [
      { outputPath: paths.outputPath, data: serializeCalibrationFadeV2ForwardValidationJson(report) },
      {
        outputPath: paths.htmlOutputPath,
        data: serializeCalibrationFadeV2ForwardValidationHtml(report),
      },
      {
        outputPath: paths.eventsOutputPath,
        data: serializeCalibrationFadeV2ForwardEventsJsonl(eventLines),
      },
      {
        outputPath: paths.marketsOutputPath,
        data: serializeCalibrationFadeV2ForwardMarketsJsonl(marketLines),
      },
    ]);

    io.writeStdout(
      `${stableStringify({
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
        captureRunId: report.captureRunId,
        evidenceMode: report.evidenceMode,
        confirmatoryEligibility: report.confirmatoryEligibility,
        hypothesisId: report.hypothesisId,
        hypothesisVersion: report.hypothesisVersion,
        hypothesisConfigurationHash: report.hypothesisConfigurationHash,
        sourceRecordType: report.sourceRecordType,
        candidateMarketCount: report.candidateMarketCount,
        interpretationClassification: report.summary.interpretationClassification,
      })}\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof CalibrationFadeV2ForwardValidationError) {
      io.writeStderr(`${error.message}\n`);
      return 1;
    }
    io.writeStderr(`${formatCommandError(error)}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const filesystemIo = createCalibrationFadeForwardValidationIo();
  const exitCode = await runCalibrationFadeV2ForwardValidationCommand(process.argv.slice(2), {
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
