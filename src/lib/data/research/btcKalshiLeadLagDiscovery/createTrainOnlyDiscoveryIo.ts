import { statSync } from "node:fs";

import type { BtcKalshiLeadLagAnalysisIo } from "../btcKalshiLeadLagAnalysis/btcKalshiLeadLagAnalysisTypes";

import { LeadLagGovernedDiscoveryError, type LeadLagDiscoveryIo } from "./leadLagDiscoveryTypes";

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

/**
 * Wrap an IO adapter so validation/holdout capture directories cannot be read
 * during train-only discovery. Writes remain unrestricted under the discovery
 * output tree.
 */
export function createTrainOnlyDiscoveryIo(input: {
  baseIo: LeadLagDiscoveryIo;
  trainCaptureRunDir: string;
  quarantinedCaptureRunDirs: readonly string[];
}): LeadLagDiscoveryIo {
  const quarantined = input.quarantinedCaptureRunDirs.map((dir) =>
    normalizePath(dir).replace(/\/$/, "")
  );

  function assertReadable(path: string): void {
    const normalized = normalizePath(path);
    for (const blocked of quarantined) {
      if (
        normalized === blocked
        || normalized.startsWith(`${blocked}/`)
      ) {
        throw new LeadLagGovernedDiscoveryError(
          `Train-only discovery IO refused to read quarantined capture path: ${path}`,
        );
      }
    }
  }

  const wrapRead = <T extends (...args: never[]) => unknown>(fn: T | undefined): T | undefined => {
    if (!fn) {
      return fn;
    }
    return ((...args: never[]) => {
      const path = String(args[0] ?? "");
      assertReadable(path);
      return fn(...args);
    }) as T;
  };

  return {
    ...input.baseIo,
    readFile: (path) => {
      assertReadable(path);
      return input.baseIo.readFile(path);
    },
    fileExists: (path) => {
      // Existence probes on quarantined dirs are allowed for split identity construction
      // only before train-only wrapping. After wrapping, deny to prove isolation.
      assertReadable(path);
      return input.baseIo.fileExists(path);
    },
    isDirectory: (path) => {
      assertReadable(path);
      return input.baseIo.isDirectory(path);
    },
    fileByteLength: wrapRead(input.baseIo.fileByteLength),
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

export function assertPathIsUnderTrainOnly(
  trainCaptureRunDir: string,
  path: string,
): boolean {
  const trainDir = normalizePath(trainCaptureRunDir).replace(/\/$/, "");
  const normalized = normalizePath(path);
  return normalized === trainDir || normalized.startsWith(`${trainDir}/`);
}

export function createFilesystemLeadLagDiscoveryIo(
  baseIo: BtcKalshiLeadLagAnalysisIo,
): LeadLagDiscoveryIo {
  return {
    ...baseIo,
    isDirectory: (path: string) => {
      try {
        return baseIo.isDirectory(path);
      } catch {
        return false;
      }
    },
    fileByteLength: (path: string) => {
      try {
        return statSync(path).size;
      } catch {
        return 0;
      }
    },
  };
}
