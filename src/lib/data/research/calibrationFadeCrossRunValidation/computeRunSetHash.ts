import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";
import { resolveSelectedRunId } from "@/lib/data/research/selectedRunCaptureHealth";

import { CALIBRATION_FADE_CROSS_RUN_VALIDATION_VERSION } from "./calibrationFadeCrossRunValidationTypes";
import type { CrossRunSourceIdentity } from "./collectRunSourceArtifactIdentities";

function normalizeCapturePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/$/, "");
}

/** Deterministic run-set identity hash; independent of CLI argument order and output timestamps. */
export function computeRunSetHash(input: {
  captureRunDirs: readonly string[];
  hypothesisId: string;
  hypothesisVersion: string;
  hypothesisConfigurationHash: string;
  analysisVersion?: string;
  sourceIdentities?: readonly CrossRunSourceIdentity[];
}): string {
  const normalizedDirs = input.captureRunDirs
    .map((dir) => normalizeCapturePath(dir))
    .sort((left, right) => left.localeCompare(right));
  const selectedRunIds = normalizedDirs
    .map((dir) => resolveSelectedRunId(dir))
    .sort((left, right) => left.localeCompare(right));

  const sourceIdentities = [...(input.sourceIdentities ?? [])]
    .map((identity) => ({
      selectedRunId: identity.selectedRunId,
      // Hash by run id + artifact fingerprints; directory spelling variants must not dominate.
      artifacts: [...identity.artifacts]
        .map((artifact) => ({
          role: artifact.role,
          // Prefer basename so absolute vs relative directory roots stay equivalent.
          pathBasename: normalizeCapturePath(artifact.path).split("/").pop() ?? artifact.path,
          sizeBytes: artifact.sizeBytes,
          mtimeMs: artifact.mtimeMs,
        }))
        .sort((left, right) => left.role.localeCompare(right.role) || left.pathBasename.localeCompare(right.pathBasename)),
    }))
    .sort((left, right) => left.selectedRunId.localeCompare(right.selectedRunId));

  return fnv1a32(
    stableStringify({
      analysisVersion: input.analysisVersion ?? CALIBRATION_FADE_CROSS_RUN_VALIDATION_VERSION,
      hypothesisConfigurationHash: input.hypothesisConfigurationHash,
      hypothesisId: input.hypothesisId,
      hypothesisVersion: input.hypothesisVersion,
      selectedRunIds,
      sourceIdentities,
    }),
  );
}
