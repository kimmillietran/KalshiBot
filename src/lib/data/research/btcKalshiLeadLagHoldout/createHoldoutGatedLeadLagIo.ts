import { LeadLagHoldoutError, type LeadLagHoldoutIo } from "./leadLagHoldoutTypes";

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

/**
 * Gate holdout capture outcome reads until lineage/contract binding authorizes them.
 * Discovery/validation artifact paths remain readable for the pre-open checklist.
 */
export function createHoldoutGatedLeadLagIo(input: {
  baseIo: LeadLagHoldoutIo;
  holdoutCaptureRunDir: string;
}): {
  io: LeadLagHoldoutIo;
  authorizeHoldoutOutcomeAccess: () => void;
  isHoldoutOutcomeAccessAuthorized: () => boolean;
} {
  const holdoutDir = normalizePath(input.holdoutCaptureRunDir).replace(/\/$/, "");
  let authorized = false;

  function assertReadable(path: string): void {
    const normalized = normalizePath(path);
    if (normalized === holdoutDir || normalized.startsWith(`${holdoutDir}/`)) {
      if (!authorized) {
        throw new LeadLagHoldoutError(
          `Holdout capture outcome access refused until lineage/contract binding succeeds: ${path}`,
        );
      }
    }
  }

  const io: LeadLagHoldoutIo = {
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

  return {
    io,
    authorizeHoldoutOutcomeAccess: () => {
      authorized = true;
    },
    isHoldoutOutcomeAccessAuthorized: () => authorized,
  };
}
