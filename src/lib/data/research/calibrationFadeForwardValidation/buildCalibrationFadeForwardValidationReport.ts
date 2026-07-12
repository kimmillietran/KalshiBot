import { analyzeCalibrationFadeForwardForRun } from "./analyzeCalibrationFadeForwardForRun";
import type {
  CalibrationFadeForwardValidationConfig,
  CalibrationFadeForwardValidationIo,
  CalibrationFadeForwardValidationReport,
} from "./calibrationFadeForwardValidationTypes";

export async function buildCalibrationFadeForwardValidationReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: CalibrationFadeForwardValidationConfig;
  io: CalibrationFadeForwardValidationIo;
  hypothesisId?: string;
}): Promise<{
  report: CalibrationFadeForwardValidationReport;
  eventLines: string[];
  marketLines: string[];
}> {
  return analyzeCalibrationFadeForwardForRun(input);
}
