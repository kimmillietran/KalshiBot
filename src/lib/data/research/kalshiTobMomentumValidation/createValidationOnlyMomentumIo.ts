import type { MomentumDiscoveryIo } from "../kalshiTobMomentumDiscovery/momentumDiscoveryTypes";

import {
  MomentumValidationError,
  type MomentumValidationIo,
} from "./momentumValidationTypes";

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

/**
 * Validation-phase IO: allow validation capture reads; quarantine holdout capture paths.
 * Mirror of lead-lag / train-only discovery quarantine.
 */
export function createValidationOnlyMomentumIo(input: {
  baseIo: MomentumValidationIo;
  holdoutCaptureRunDirs: readonly string[];
  /** Optional additional quarantined dirs (e.g. unrelated contaminated runs). */
  additionalQuarantinedDirs?: readonly string[];
}): MomentumValidationIo {
  const quarantined = [
    ...input.holdoutCaptureRunDirs,
    ...(input.additionalQuarantinedDirs ?? []),
  ].map((dir) => normalizePath(dir).replace(/\/$/, ""));

  function assertReadable(path: string): void {
    const normalized = normalizePath(path);
    for (const blocked of quarantined) {
      if (normalized === blocked || normalized.startsWith(`${blocked}/`)) {
        throw new MomentumValidationError(
          `Validation IO refused to read quarantined HOLDOUT capture path: ${path}`,
        );
      }
    }
  }

  return {
    ...input.baseIo,
    readFile: (path) => {
      assertReadable(path);
      return input.baseIo.readFile(path);
    },
    fileExists: (path) => {
      assertReadable(path);
      return input.baseIo.fileExists(path);
    },
    isDirectory: (path) => {
      assertReadable(path);
      return input.baseIo.isDirectory(path);
    },
    fileByteLength: input.baseIo.fileByteLength
      ? (path) => {
          assertReadable(path);
          return input.baseIo.fileByteLength!(path);
        }
      : undefined,
    listDirectory: input.baseIo.listDirectory
      ? (path) => {
          assertReadable(path);
          return input.baseIo.listDirectory!(path);
        }
      : undefined,
    iterateJsonl: async (path, options) => {
      assertReadable(path);
      return input.baseIo.iterateJsonl(path, options);
    },
    writeFile: input.baseIo.writeFile,
    appendFile: input.baseIo.appendFile,
    mkdirSync: input.baseIo.mkdirSync,
    unlinkFile: input.baseIo.unlinkFile,
    renameFile: input.baseIo.renameFile,
  };
}

export function createFilesystemMomentumValidationIo(
  baseIo: MomentumDiscoveryIo,
): MomentumValidationIo {
  return baseIo;
}

/**
 * Live capture outcome streaming is intentionally fail-closed in M14.0c unless
 * the cohort gate has already authorized access. Prefer synthetic injected outcomes.
 */
export function assertRealValidationCaptureStreamAllowed(input: {
  authorizedForOutcomeOpen: boolean;
  requestRealCaptureStream: boolean;
}): void {
  if (input.requestRealCaptureStream && !input.authorizedForOutcomeOpen) {
    throw new MomentumValidationError(
      "Real validation capture outcome streaming refused: cohort is not "
        + "ready-for-outcome-open (fail closed).",
    );
  }
  if (input.requestRealCaptureStream) {
    throw new MomentumValidationError(
      "Real validation capture outcome streaming is not implemented in M14.0c "
        + "default path; use synthetic injected outcomes. Fail closed.",
    );
  }
}
