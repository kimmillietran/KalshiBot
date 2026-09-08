import { publishResearchArtifactsAtomically } from "../calibrationFadeForwardValidation/publishResearchArtifactsAtomically";

import type {
  CalibrationFadeV2CaptureReadinessConfig,
  CalibrationFadeV2CaptureReadinessIo,
  CalibrationFadeV2CaptureReadinessOutputPaths,
  CalibrationFadeV2CaptureReadinessReport,
} from "./calibrationFadeV2CaptureReadinessTypes";
import { evaluateCalibrationFadeV2CaptureReadiness } from "./evaluateCalibrationFadeV2CaptureReadiness";
import {
  serializeCalibrationFadeV2CaptureReadinessHtml,
  serializeCalibrationFadeV2CaptureReadinessJson,
} from "./serializeCalibrationFadeV2CaptureReadiness";

export async function buildCalibrationFadeV2CaptureReadiness(input: {
  generatedAt: string;
  config: CalibrationFadeV2CaptureReadinessConfig;
  paths: CalibrationFadeV2CaptureReadinessOutputPaths;
  io: CalibrationFadeV2CaptureReadinessIo;
}): Promise<CalibrationFadeV2CaptureReadinessReport> {
  const report = await evaluateCalibrationFadeV2CaptureReadiness(input);
  input.io.mkdirSync(input.paths.jsonOutputPath.replace(/\/[^/]+$/, ""), { recursive: true });
  input.io.mkdirSync(input.paths.htmlOutputPath.replace(/\/[^/]+$/, ""), { recursive: true });
  publishResearchArtifactsAtomically(input.io, [
    {
      outputPath: input.paths.jsonOutputPath,
      data: serializeCalibrationFadeV2CaptureReadinessJson(report),
    },
    {
      outputPath: input.paths.htmlOutputPath,
      data: serializeCalibrationFadeV2CaptureReadinessHtml(report),
    },
  ]);
  return report;
}
