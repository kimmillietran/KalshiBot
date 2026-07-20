import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";
import { resolveSelectedRunId } from "@/lib/data/research/selectedRunCaptureHealth";

import { CALIBRATION_FADE_CROSS_RUN_VALIDATION_VERSION } from "./calibrationFadeCrossRunValidationTypes";

function normalizeCapturePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/$/, "");
}

/** Deterministic run-set identity hash; independent of CLI argument order. */
export function computeRunSetHash(input: {
  captureRunDirs: readonly string[];
  hypothesisId: string;
  hypothesisVersion: string;
  hypothesisConfigurationHash: string;
  analysisVersion?: string;
}): string {
  const normalizedDirs = input.captureRunDirs
    .map((dir) => normalizeCapturePath(dir))
    .sort((left, right) => left.localeCompare(right));
  const selectedRunIds = normalizedDirs
    .map((dir) => resolveSelectedRunId(dir))
    .sort((left, right) => left.localeCompare(right));

  return fnv1a32(
    stableStringify({
      analysisVersion: input.analysisVersion ?? CALIBRATION_FADE_CROSS_RUN_VALIDATION_VERSION,
      hypothesisConfigurationHash: input.hypothesisConfigurationHash,
      hypothesisId: input.hypothesisId,
      hypothesisVersion: input.hypothesisVersion,
      selectedRunDirectories: normalizedDirs,
      selectedRunIds,
    }),
  );
}
