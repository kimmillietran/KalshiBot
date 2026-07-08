import {
  DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_HTML_PATH,
  DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS,
  DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_OUTPUT_PATH,
  type CalibrationFadeFamilyVerdictInputPaths,
} from "./calibrationFadeFamilyVerdictTypes";

function readFlagValue(argv: readonly string[], flag: string, defaultValue: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new Error(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }

  return defaultValue;
}

export function parseCalibrationFadeFamilyVerdictPathsFromArgv(
  argv: readonly string[],
): {
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: CalibrationFadeFamilyVerdictInputPaths;
} {
  return {
    outputPath: readFlagValue(
      argv,
      "--output",
      DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_OUTPUT_PATH,
    ),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_HTML_PATH,
    ),
    inputPaths: {
      familyId: readFlagValue(
        argv,
        "--family",
        DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS.familyId,
      ),
      hypothesisCandidatesPath: readFlagValue(
        argv,
        "--hypotheses",
        DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS.hypothesisCandidatesPath,
      ),
      hypothesisValidationPath: readFlagValue(
        argv,
        "--validation",
        DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS.hypothesisValidationPath,
      ),
      costAwareAtlasPath: readFlagValue(
        argv,
        "--cost-aware-atlas",
        DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS.costAwareAtlasPath,
      ),
      hypothesisTradeReplayPath: readFlagValue(
        argv,
        "--trade-replay",
        DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS.hypothesisTradeReplayPath,
      ),
      oosPowerCorrectionPath: readFlagValue(
        argv,
        "--oos-power-correction",
        DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS.oosPowerCorrectionPath,
      ),
      derivedSettlementSensitivityPath: readFlagValue(
        argv,
        "--derived-sensitivity",
        DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS.derivedSettlementSensitivityPath,
      ),
      featureCatalogPath: readFlagValue(
        argv,
        "--feature-catalog",
        DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS.featureCatalogPath,
      ),
      researchRecommendationsPath: readFlagValue(
        argv,
        "--research-recommendations",
        DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS.researchRecommendationsPath,
      ),
      hypothesisFailureAnalysisPath: readFlagValue(
        argv,
        "--failure-analysis",
        DEFAULT_CALIBRATION_FADE_FAMILY_VERDICT_INPUT_PATHS.hypothesisFailureAnalysisPath,
      ),
    },
  };
}
