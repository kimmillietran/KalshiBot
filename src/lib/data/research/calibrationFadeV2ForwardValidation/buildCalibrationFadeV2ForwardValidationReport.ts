import { analyzeCalibrationFadeV2ForwardForRun } from "./analyzeCalibrationFadeV2ForwardForRun";
import type {
  CalibrationFadeV2EvidenceIdentity,
  CalibrationFadeV2ForwardValidationConfig,
  CalibrationFadeV2ForwardValidationIo,
  CalibrationFadeV2ForwardValidationReport,
  CalibrationFadeV2OutputPaths,
} from "./calibrationFadeV2ForwardValidationTypes";

export async function buildCalibrationFadeV2ForwardValidationReport(input: {
  generatedAt: string;
  paths: CalibrationFadeV2OutputPaths;
  config: CalibrationFadeV2ForwardValidationConfig;
  io: CalibrationFadeV2ForwardValidationIo;
  hypothesisId?: string;
}): Promise<{
  report: CalibrationFadeV2ForwardValidationReport;
  eventLines: string[];
  marketLines: string[];
  evidenceIdentity: CalibrationFadeV2EvidenceIdentity;
}> {
  return analyzeCalibrationFadeV2ForwardForRun(input);
}
