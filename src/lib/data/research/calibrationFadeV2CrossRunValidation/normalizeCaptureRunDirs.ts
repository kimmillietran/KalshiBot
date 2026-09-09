import { resolveSelectedRunId } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";

import {
  CalibrationFadeV2CrossRunValidationError,
  type NormalizedCaptureRun,
} from "./calibrationFadeV2CrossRunValidationTypes";

export type { NormalizedCaptureRun };

export function normalizeCaptureRunDir(captureRunDir: string): string {
  return captureRunDir.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function identifyCaptureRunDir(captureRunDir: string): NormalizedCaptureRun {
  const normalized = normalizeCaptureRunDir(captureRunDir);
  const runId = resolveSelectedRunId(normalized);
  if (!runId || runId === "." || runId === "..") {
    throw new CalibrationFadeV2CrossRunValidationError(
      `Invalid capture run directory: ${captureRunDir}`,
    );
  }
  return { captureRunDir: normalized, runId };
}

export function identifyUniqueCaptureRuns(
  captureRunDirs: readonly string[],
): NormalizedCaptureRun[] {
  const identified = captureRunDirs.map(identifyCaptureRunDir);
  const seenDirs = new Set<string>();
  const seenIds = new Set<string>();
  for (const entry of identified) {
    if (seenDirs.has(entry.captureRunDir)) {
      throw new CalibrationFadeV2CrossRunValidationError(
        `Duplicate normalized capture run directory: ${entry.captureRunDir}`,
      );
    }
    if (seenIds.has(entry.runId)) {
      throw new CalibrationFadeV2CrossRunValidationError(
        `Duplicate resolved runId: ${entry.runId}`,
      );
    }
    seenDirs.add(entry.captureRunDir);
    seenIds.add(entry.runId);
  }
  return identified;
}
