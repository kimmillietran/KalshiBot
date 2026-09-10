import type { MicrostructureDiscoveryIo } from "./microstructureDiscoveryTypes";
import { MicrostructureGovernedDiscoveryError } from "./microstructureDiscoveryTypes";

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

/**
 * Wrap IO so validation/holdout capture directories cannot be read during TRAIN-only discovery.
 */
export function createTrainOnlyMicrostructureDiscoveryIo(input: {
  baseIo: MicrostructureDiscoveryIo;
  quarantinedCaptureRunDirs: readonly string[];
}): MicrostructureDiscoveryIo {
  const quarantined = input.quarantinedCaptureRunDirs.map((dir) =>
    normalizePath(dir).replace(/\/$/, ""),
  );

  function assertReadable(path: string): void {
    const normalized = normalizePath(path);
    for (const blocked of quarantined) {
      if (normalized === blocked || normalized.startsWith(`${blocked}/`)) {
        throw new MicrostructureGovernedDiscoveryError(
          `Train-only microstructure discovery IO refused to read quarantined capture path: ${path}`,
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
