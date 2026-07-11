import { joinPath } from "./downstreamAnalysisScopeUtils";

export type CaptureRunDiscoveryIo = {
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

/** Lists capture run directories containing capture-health.json. */
export function discoverCaptureRunDirectories(
  io: CaptureRunDiscoveryIo,
  rootPath: string,
): string[] {
  if (!io.fileExists(rootPath) || !io.isDirectory(rootPath)) {
    return [];
  }

  return io
    .readdir(rootPath)
    .map((entry) => joinPath(rootPath, entry))
    .filter((entryPath) => io.isDirectory(entryPath))
    .filter((entryPath) => io.fileExists(joinPath(entryPath, "capture-health.json")));
}

/** Resolves run directories for aggregate or selected-run analysis. */
export function resolveCaptureRunDirectories(input: {
  io: CaptureRunDiscoveryIo;
  forwardQuotesDir: string;
  captureRunDir: string | null;
}): string[] {
  if (input.captureRunDir) {
    return [input.captureRunDir.replace(/\\/g, "/")];
  }

  return discoverCaptureRunDirectories(input.io, input.forwardQuotesDir);
}
