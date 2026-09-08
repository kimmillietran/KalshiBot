import { resolveSelectedRunId } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";

import {
  CalibrationFadeV2CaptureReadinessError,
  V2_CAPTURE_READINESS_HTML_FILENAME,
  V2_CAPTURE_READINESS_HTML_ROOT,
  V2_CAPTURE_READINESS_JSON_FILENAME,
  V2_CAPTURE_READINESS_JSON_ROOT,
  type CalibrationFadeV2CaptureReadinessOutputPaths,
} from "./calibrationFadeV2CaptureReadinessTypes";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/$/, "");
}

export function resolveCalibrationFadeV2CaptureReadinessOutputPaths(input: {
  captureRunDir: string;
  jsonOutputPath?: string | null;
  htmlOutputPath?: string | null;
}): CalibrationFadeV2CaptureReadinessOutputPaths {
  const runId = resolveSelectedRunId(input.captureRunDir);
  if (!runId) {
    throw new CalibrationFadeV2CaptureReadinessError(
      `Invalid capture run directory: ${input.captureRunDir}`,
    );
  }

  const resolved: CalibrationFadeV2CaptureReadinessOutputPaths = {
    jsonOutputPath: normalizePath(
      input.jsonOutputPath
        ?? `${V2_CAPTURE_READINESS_JSON_ROOT}/${runId}/${V2_CAPTURE_READINESS_JSON_FILENAME}`,
    ),
    htmlOutputPath: normalizePath(
      input.htmlOutputPath
        ?? `${V2_CAPTURE_READINESS_HTML_ROOT}/${runId}/${V2_CAPTURE_READINESS_HTML_FILENAME}`,
    ),
  };

  for (const path of Object.values(resolved)) {
    assertV2CaptureReadinessOutputPathIsolation({ path, runId });
  }

  return resolved;
}

export function assertV2CaptureReadinessOutputPathIsolation(input: {
  path: string;
  runId: string;
}): void {
  const path = normalizePath(input.path);
  if (path.includes("/latest") || path.endsWith("/latest")) {
    throw new CalibrationFadeV2CaptureReadinessError(
      "v2 capture readiness output paths must not use a latest fallback",
    );
  }
  if (
    path.includes("/calibration-fade-forward-validation")
    || path.includes("/calibration-fade-v2/diagnostic/")
    || path.includes("/calibration-fade-v2/confirmatory/")
  ) {
    throw new CalibrationFadeV2CaptureReadinessError(
      `v2 capture readiness must not publish into evaluator or v1 paths: ${path}`,
    );
  }
  const expectedFragment = `/calibration-fade-v2/readiness/${input.runId}/`;
  if (!path.includes(expectedFragment)) {
    throw new CalibrationFadeV2CaptureReadinessError(
      `v2 capture readiness output path must be run-scoped (expected ${expectedFragment}): ${path}`,
    );
  }
}
