import {
  CalibrationFadeV2CrossRunValidationError,
  V2_CROSS_RUN_FORBIDDEN_OUTPUT_PATHS,
  V2_CROSS_RUN_HTML_ROOT,
  V2_CROSS_RUN_JSON_ROOT,
  type CalibrationFadeV2CrossRunOutputPaths,
} from "./calibrationFadeV2CrossRunValidationTypes";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function assertV2CrossRunOutputPathIsolation(path: string, runSetHash: string): void {
  const normalized = normalizePath(path);
  if ((V2_CROSS_RUN_FORBIDDEN_OUTPUT_PATHS as readonly string[]).includes(normalized)) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `v2 cross-run must not publish to v1 canonical path ${normalized}`,
    );
  }
  if (normalized.includes("/latest") || normalized.endsWith("/latest")) {
    throw new CalibrationFadeV2CrossRunValidationError(
      "v2 cross-run output paths must not use a latest fallback",
    );
  }
  if (normalized.includes("/calibration-fade-v2/cross-run/diagnostic/")) {
    throw new CalibrationFadeV2CrossRunValidationError(
      "M12.6e does not publish a diagnostic cross-run aggregate",
    );
  }
  const expectedFragment = `/calibration-fade-v2/cross-run/confirmatory/${runSetHash}/`;
  if (!normalized.includes(expectedFragment)) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `v2 cross-run output path must be content-addressed under ${expectedFragment}: ${normalized}`,
    );
  }
}

export function resolveCalibrationFadeV2CrossRunOutputPaths(input: {
  runSetHash: string;
  outputPath?: string | null;
  htmlOutputPath?: string | null;
  marketsOutputPath?: string | null;
  runsOutputPath?: string | null;
  appearancesOutputPath?: string | null;
}): CalibrationFadeV2CrossRunOutputPaths {
  const jsonRoot = `${V2_CROSS_RUN_JSON_ROOT}/${input.runSetHash}`;
  const htmlRoot = `${V2_CROSS_RUN_HTML_ROOT}/${input.runSetHash}`;
  const resolved: CalibrationFadeV2CrossRunOutputPaths = {
    outputPath: normalizePath(
      input.outputPath ?? `${jsonRoot}/calibration-fade-v2-cross-run-validation.json`,
    ),
    htmlOutputPath: normalizePath(
      input.htmlOutputPath ?? `${htmlRoot}/calibration-fade-v2-cross-run-validation.html`,
    ),
    marketsOutputPath: normalizePath(
      input.marketsOutputPath ?? `${jsonRoot}/calibration-fade-v2-cross-run-markets.jsonl`,
    ),
    runsOutputPath: normalizePath(
      input.runsOutputPath ?? `${jsonRoot}/calibration-fade-v2-cross-run-runs.jsonl`,
    ),
    appearancesOutputPath: normalizePath(
      input.appearancesOutputPath ?? `${jsonRoot}/calibration-fade-v2-cross-run-appearances.jsonl`,
    ),
  };

  for (const path of Object.values(resolved)) {
    assertV2CrossRunOutputPathIsolation(path, input.runSetHash);
  }
  return resolved;
}
