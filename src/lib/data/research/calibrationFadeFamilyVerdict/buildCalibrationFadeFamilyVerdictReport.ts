import { evaluateCalibrationFadeFamilyVerdict } from "./evaluateCalibrationFadeFamilyVerdict";
import type { LoadedCalibrationFadeFamilyVerdictInputs } from "./loadCalibrationFadeFamilyVerdictInputs";
import {
  CALIBRATION_FADE_FAMILY_VERDICT_THRESHOLDS,
  type CalibrationFadeFamilyVerdictInputPaths,
  type CalibrationFadeFamilyVerdictReport,
} from "./calibrationFadeFamilyVerdictTypes";

/** Builds the calibration-fade family verdict report from loaded upstream artifacts. */
export function buildCalibrationFadeFamilyVerdictReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: CalibrationFadeFamilyVerdictInputPaths;
  loadedInputs: LoadedCalibrationFadeFamilyVerdictInputs;
}): CalibrationFadeFamilyVerdictReport {
  const evaluation = evaluateCalibrationFadeFamilyVerdict(
    input.loadedInputs,
    input.inputPaths.familyId,
  );

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: evaluation.disclaimer,
    caveats: evaluation.caveats,
    inputPaths: input.inputPaths,
    inputStatus: input.loadedInputs.inputStatus,
    thresholds: CALIBRATION_FADE_FAMILY_VERDICT_THRESHOLDS,
    summary: evaluation.summary,
    hypotheses: evaluation.hypotheses,
  };
}
