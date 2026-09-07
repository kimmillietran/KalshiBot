import { describe, expect, it } from "vitest";

import {
  DEFAULT_CALIBRATION_FADE_FORWARD_EVENTS_PATH,
  DEFAULT_CALIBRATION_FADE_FORWARD_MARKETS_PATH,
  DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_HTML_PATH,
  DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_OUTPUT_PATH,
} from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import { createMemoryCalibrationFadeForwardValidationIo } from "../calibrationFadeForwardValidation/createCalibrationFadeForwardValidationIo";

import { CalibrationFadeV2ForwardValidationError } from "./calibrationFadeV2ForwardValidationTypes";
import {
  assertV2PublishIdentityCompatible,
  resolveCalibrationFadeV2OutputPaths,
} from "./resolveCalibrationFadeV2OutputPaths";

const RUN_A = "data/live-capture/forward-quotes/run-v2-a";
const RUN_B = "data/live-capture/forward-quotes/run-v2-b";

describe("resolveCalibrationFadeV2OutputPaths", () => {
  it("never resolves to v1 default paths", () => {
    const diagnostic = resolveCalibrationFadeV2OutputPaths({
      evidenceMode: "diagnostic",
      captureRunDir: RUN_A,
    });
    const confirmatory = resolveCalibrationFadeV2OutputPaths({
      evidenceMode: "confirmatory",
      captureRunDir: RUN_A,
    });
    const resolved = [...Object.values(diagnostic), ...Object.values(confirmatory)];
    expect(resolved).not.toContain(DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_OUTPUT_PATH);
    expect(resolved).not.toContain(DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_HTML_PATH);
    expect(resolved).not.toContain(DEFAULT_CALIBRATION_FADE_FORWARD_EVENTS_PATH);
    expect(resolved).not.toContain(DEFAULT_CALIBRATION_FADE_FORWARD_MARKETS_PATH);
    expect(() =>
      resolveCalibrationFadeV2OutputPaths({
        evidenceMode: "diagnostic",
        captureRunDir: RUN_A,
        outputPath: DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_OUTPUT_PATH,
      }),
    ).toThrow(/v1 canonical path/);
  });

  it("keeps diagnostic and confirmatory namespaces distinct", () => {
    const diagnostic = resolveCalibrationFadeV2OutputPaths({
      evidenceMode: "diagnostic",
      captureRunDir: RUN_A,
    });
    const confirmatory = resolveCalibrationFadeV2OutputPaths({
      evidenceMode: "confirmatory",
      captureRunDir: RUN_A,
    });
    expect(diagnostic.outputPath).toContain("/calibration-fade-v2/diagnostic/run-v2-a/");
    expect(confirmatory.outputPath).toContain("/calibration-fade-v2/confirmatory/run-v2-a/");
    expect(diagnostic.outputPath).not.toBe(confirmatory.outputPath);
    expect(() =>
      resolveCalibrationFadeV2OutputPaths({
        evidenceMode: "diagnostic",
        captureRunDir: RUN_A,
        outputPath:
          "data/research-results/calibration-fade-v2/confirmatory/run-v2-a/calibration-fade-forward-validation.json",
      }),
    ).toThrow(/Cannot publish diagnostic evaluation into confirmatory path/);
  });

  it("scopes distinct run IDs to distinct paths", () => {
    const a = resolveCalibrationFadeV2OutputPaths({
      evidenceMode: "diagnostic",
      captureRunDir: RUN_A,
    });
    const b = resolveCalibrationFadeV2OutputPaths({
      evidenceMode: "diagnostic",
      captureRunDir: RUN_B,
    });
    expect(a.outputPath).not.toBe(b.outputPath);
    expect(a.outputPath).toContain("/run-v2-a/");
    expect(b.outputPath).toContain("/run-v2-b/");
  });

  it("refuses an incompatible identity overwrite", () => {
    const path =
      "data/research-results/calibration-fade-v2/diagnostic/run-v2-a/calibration-fade-forward-validation.json";
    const io = createMemoryCalibrationFadeForwardValidationIo({
      [path]: JSON.stringify({
        evidenceIdentity: {
          evidenceMode: "confirmatory",
          captureRunId: "run-v2-a",
          configurationHash: "aaaa",
          sourceRecordType: "exchange-completed-1m-ohlc",
          hypothesisVersion: "v2",
        },
      }),
    });
    expect(() =>
      assertV2PublishIdentityCompatible({
        io,
        path,
        identity: {
          hypothesisId: "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
          hypothesisVersion: "v2",
          configurationHash: "bbbb",
          freezeCommitSha: "1c5ef9da3ef5e48af26c05b850183b0e8d4290d0",
          sourceRecordType: "exchange-completed-1m-ohlc",
          sourceContractId: "exchange-completed-1m-ohlc",
          captureRunId: "run-v2-a",
          captureStartedAt: "2026-09-07T00:00:00.000Z",
          evidenceMode: "diagnostic",
          confirmatoryEligibility: false,
          confirmatoryIneligibilityReason: "diagnostic-evaluation-does-not-claim-confirmatory",
        },
      }),
    ).toThrow(CalibrationFadeV2ForwardValidationError);
  });

  it("has no latest fallback", () => {
    expect(() =>
      resolveCalibrationFadeV2OutputPaths({
        evidenceMode: "diagnostic",
        captureRunDir: RUN_A,
        outputPath:
          "data/research-results/calibration-fade-v2/diagnostic/latest/calibration-fade-forward-validation.json",
      }),
    ).toThrow(/latest fallback/);
  });
});
