import { posix } from "node:path";

import {
  ExperimentRegistryError,
  ExperimentRegistryErrorCode,
  EXPERIMENT_RECORD_FILENAME,
} from "./experimentRegistryTypes";

export const INVALID_PATH_SEGMENT_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/;
export const RESERVED_PATH_SEGMENT_PATTERN = /^(?:\.|\.\.)$/;

export function assertSafePathSegment(
  value: string,
  label: string,
  marketTicker?: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ExperimentRegistryError(
      `${label} is required`,
      ExperimentRegistryErrorCode.INVALID_METADATA,
      { marketTicker },
    );
  }

  if (
    INVALID_PATH_SEGMENT_PATTERN.test(trimmed)
    || RESERVED_PATH_SEGMENT_PATTERN.test(trimmed)
  ) {
    throw new ExperimentRegistryError(
      `${label} contains invalid path characters`,
      ExperimentRegistryErrorCode.INVALID_METADATA,
      { marketTicker: marketTicker ?? trimmed },
    );
  }

  return trimmed;
}

export function normalizeRootPath(root: string): string {
  return root.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function buildExperimentRecordOutputPath(
  experimentsRoot: string,
  experimentId: string,
): string {
  const safeExperimentId = assertSafePathSegment(experimentId, "experimentId");
  return posix.join(
    normalizeRootPath(experimentsRoot),
    safeExperimentId,
    EXPERIMENT_RECORD_FILENAME,
  );
}

export function buildExperimentDirectoryPath(
  experimentsRoot: string,
  experimentId: string,
): string {
  const safeExperimentId = assertSafePathSegment(experimentId, "experimentId");
  return posix.join(normalizeRootPath(experimentsRoot), safeExperimentId);
}
