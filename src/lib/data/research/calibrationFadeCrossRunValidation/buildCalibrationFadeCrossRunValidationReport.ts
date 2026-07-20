import { analyzeCalibrationFadeCrossRun } from "./analyzeCalibrationFadeCrossRun";
import type {
  CalibrationFadeCrossRunValidationConfig,
  CalibrationFadeCrossRunValidationIo,
  CalibrationFadeCrossRunValidationReport,
} from "./calibrationFadeCrossRunValidationTypes";
import type { AnalyzePerRunFn } from "./analyzeCalibrationFadeCrossRun";

export async function buildCalibrationFadeCrossRunValidationReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: CalibrationFadeCrossRunValidationConfig;
  io: CalibrationFadeCrossRunValidationIo;
  hypothesisId?: string;
  analyzePerRun?: AnalyzePerRunFn;
}): Promise<{
  report: CalibrationFadeCrossRunValidationReport;
  marketLines: string[];
  runLines: string[];
  appearanceLines: string[];
}> {
  return analyzeCalibrationFadeCrossRun(input);
}
