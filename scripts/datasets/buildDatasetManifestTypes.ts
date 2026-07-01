export class BuildDatasetManifestCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildDatasetManifestCommandError";
  }
}

export type BuildDatasetManifestCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  readdir: (path: string) => readonly string[];
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export function parseInputDirFromArgv(
  argv: readonly string[],
  defaultInputDir = "data/imports",
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BuildDatasetManifestCommandError(
          "Missing value for --input-dir <path>",
        );
      }
      return next;
    }
  }

  return defaultInputDir;
}

export function parseOutputPathFromArgv(argv: readonly string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BuildDatasetManifestCommandError(
          "Missing value for --output <path>",
        );
      }
      return next;
    }
  }

  throw new BuildDatasetManifestCommandError(
    "Missing required --output <path>",
  );
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
