import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import { createCalibrationFadeForwardValidationIo } from "@/lib/data/research/calibrationFadeForwardValidation";
import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation/publishResearchArtifactsAtomically";
import {
  buildCalibrationFadeV2EvidenceStrengthReport,
  parseCalibrationFadeV2EvidenceStrengthArgv,
  serializeCalibrationFadeV2EvidenceStrengthHtml,
  serializeCalibrationFadeV2EvidenceStrengthJson,
} from "@/lib/data/research/calibrationFadeV2EvidenceStrength";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type CalibrationFadeV2EvidenceStrengthCommandIo = {
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

export async function runCalibrationFadeV2EvidenceStrengthCommand(
  argv: readonly string[],
  io: CalibrationFadeV2EvidenceStrengthCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const config = parseCalibrationFadeV2EvidenceStrengthArgv(argv);
    const analysisIo = {
      ...createCalibrationFadeForwardValidationIo(),
      fileExists: io.fileExists,
      readFile: io.readFile,
      writeFile: io.writeFile,
      unlinkFile: io.unlinkFile,
      renameFile: io.renameFile,
    };
    const report = buildCalibrationFadeV2EvidenceStrengthReport({
      config,
      io: analysisIo,
      generatedAt: options?.generatedAt ?? new Date().toISOString(),
    });

    io.mkdirSync(dirname(report.outputPath), { recursive: true });
    io.mkdirSync(dirname(report.htmlOutputPath), { recursive: true });

    publishResearchArtifactsAtomically(io, [
      {
        outputPath: report.outputPath,
        data: serializeCalibrationFadeV2EvidenceStrengthJson(report),
      },
      {
        outputPath: report.htmlOutputPath,
        data: serializeCalibrationFadeV2EvidenceStrengthHtml(report),
      },
    ]);

    io.writeStdout(
      `${stableStringify({
        analysisVersion: report.analysisVersion,
        sourceRunSetHash: report.sourceRunSetHash,
        sourceSettlementSnapshotHash: report.sourceSettlementSnapshotHash,
        candidateMarketCount: report.candidateMarketCount,
        observedSignedCalibrationGap: report.observedSignedCalibrationGap,
        governedInterpretationClassification: report.governedInterpretationClassification,
        exactCalibratedNullDistribution: {
          probabilityOfReject: report.exactCalibratedNullDistribution.probabilityOfReject,
          probabilityOfSupportCalibration:
            report.exactCalibratedNullDistribution.probabilityOfSupportCalibration,
          probabilityOfInconclusive:
            report.exactCalibratedNullDistribution.probabilityOfInconclusive,
          probabilityOfSupportExecutable:
            report.exactCalibratedNullDistribution.probabilityOfSupportExecutable,
        },
        inconclusiveBandReachable: report.verdictReachability.inconclusiveBandReachable,
        stoppingRuleStatus: report.stoppingRuleAssessment.stoppingRuleStatus,
        loroCurrentlyInformative: report.loroAssessment.loroCurrentlyInformative,
        recommendedResearchAction: report.recommendedResearchAction,
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
      })}\n`,
    );
    return 0;
  } catch (error) {
    io.writeStderr(`${formatCommandError(error)}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const exitCode = await runCalibrationFadeV2EvidenceStrengthCommand(process.argv.slice(2), {
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

if (
  import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith("buildCalibrationFadeV2EvidenceStrength.ts")
) {
  void main();
}
