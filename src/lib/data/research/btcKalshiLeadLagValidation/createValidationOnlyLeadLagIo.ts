import type { LeadLagDiscoveryIo } from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";
import { LeadLagGovernedDiscoveryError } from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";

import { LeadLagValidationError, type LeadLagValidationIo } from "./leadLagValidationTypes";

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

/**
 * Validation-phase IO: allow validation capture reads; quarantine holdout capture paths.
 * Train capture may be readable only for identity/health metadata already embedded in the
 * discovery artifact — prefer not to re-stream train TOB. Holdout outcome paths are blocked.
 */
export function createValidationOnlyLeadLagIo(input: {
  baseIo: LeadLagValidationIo;
  validationCaptureRunDir: string;
  holdoutCaptureRunDir: string;
}): LeadLagValidationIo {
  const holdoutDir = normalizePath(input.holdoutCaptureRunDir).replace(/\/$/, "");

  function assertReadable(path: string): void {
    const normalized = normalizePath(path);
    if (normalized === holdoutDir || normalized.startsWith(`${holdoutDir}/`)) {
      throw new LeadLagValidationError(
        `Validation IO refused to read quarantined HOLDOUT capture path: ${path}`,
      );
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
    iterateJsonl: async (path, options) => {
      assertReadable(path);
      return input.baseIo.iterateJsonl(path, options);
    },
    streamJsonl: async (path, options) => {
      assertReadable(path);
      return input.baseIo.streamJsonl(path, options);
    },
    writeFile: input.baseIo.writeFile,
    appendFile: input.baseIo.appendFile,
    mkdirSync: input.baseIo.mkdirSync,
    unlinkFile: input.baseIo.unlinkFile,
    renameFile: input.baseIo.renameFile,
  };
}

export function createFilesystemLeadLagValidationIo(
  baseIo: LeadLagDiscoveryIo,
): LeadLagValidationIo {
  return baseIo;
}

export function mapQuarantineError(error: unknown): never {
  if (error instanceof LeadLagValidationError || error instanceof LeadLagGovernedDiscoveryError) {
    throw error;
  }
  throw error;
}
