import { describe, expect, it } from "vitest";

import {
  DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_OUTPUT_PATH,
} from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import {
  DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
} from "../calibrationFadeV2Preregistration";

import { parseCalibrationFadeV2ForwardValidationArgv } from "./parseCalibrationFadeV2ForwardValidationArgv";

const RUN_DIR = "data/live-capture/forward-quotes/run-v2-cli";

describe("parseCalibrationFadeV2ForwardValidationArgv", () => {
  it("requires explicit evidence mode and fails closed when it is missing", () => {
    expect(() =>
      parseCalibrationFadeV2ForwardValidationArgv(["--capture-run-dir", RUN_DIR]),
    ).toThrow(/--evidence-mode is required/);
    expect(() =>
      parseCalibrationFadeV2ForwardValidationArgv([
        "--capture-run-dir",
        RUN_DIR,
        "--evidence-mode",
        "latest",
      ]),
    ).toThrow(/must be diagnostic or confirmatory/);
  });

  it("requires an explicit capture run and rejects latest selection", () => {
    expect(() => parseCalibrationFadeV2ForwardValidationArgv(["--evidence-mode", "diagnostic"])).toThrow(
      /--capture-run-dir is required/,
    );
    expect(() =>
      parseCalibrationFadeV2ForwardValidationArgv([
        "--capture-run-dir",
        RUN_DIR,
        "--evidence-mode",
        "diagnostic",
        "--latest",
      ]),
    ).toThrow(/does not support latest-run selection/);
  });

  it("defaults to the merged v2 preregistration module and isolates output namespaces", () => {
    const diagnostic = parseCalibrationFadeV2ForwardValidationArgv([
      "--capture-run-dir",
      RUN_DIR,
      "--evidence-mode",
      "diagnostic",
    ]);
    const confirmatory = parseCalibrationFadeV2ForwardValidationArgv([
      "--capture-run-dir",
      RUN_DIR,
      "--evidence-mode",
      "confirmatory",
    ]);
    expect(diagnostic.config.hypothesisConfigPath).toBe(DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH);
    expect(diagnostic.config.evidenceMode).toBe("diagnostic");
    expect(confirmatory.config.evidenceMode).toBe("confirmatory");
    expect(diagnostic.outputPath).not.toBe(confirmatory.outputPath);
    expect(diagnostic.outputPath).not.toBe(DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_OUTPUT_PATH);
    expect(diagnostic.outputPath).toContain("/calibration-fade-v2/diagnostic/run-v2-cli/");
  });

  it("does not fall back to v1 paths when overrides are omitted", () => {
    const parsed = parseCalibrationFadeV2ForwardValidationArgv([
      "--capture-run-dir",
      RUN_DIR,
      "--evidence-mode",
      "confirmatory",
    ]);
    expect(parsed.outputPath).not.toBe(DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_OUTPUT_PATH);
    expect(parsed.outputPath.endsWith(
      "calibration-fade-v2/confirmatory/run-v2-cli/calibration-fade-forward-validation.json",
    )).toBe(true);
  });
});
