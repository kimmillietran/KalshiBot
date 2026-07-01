export class BuildResearchDatasetRegistryCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildResearchDatasetRegistryCommandError";
  }
}

export type BuildResearchDatasetRegistryCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  readdir: (path: string) => readonly string[];
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export function parseFixturesDirFromArgv(
  argv: readonly string[],
  defaultDir = "data/fixtures",
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BuildResearchDatasetRegistryCommandError(
          "Missing value for --input-dir <path>",
        );
      }
      return next;
    }
  }

  return defaultDir;
}

export function parseMetadataDirFromArgv(
  argv: readonly string[],
  defaultDir = "data/imports",
): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--metadata-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BuildResearchDatasetRegistryCommandError(
          "Missing value for --metadata-dir <path>",
        );
      }
      return next;
    }
  }

  return defaultDir;
}

export function parseOutputDirFromArgv(
  argv: readonly string[],
  defaultDir = "data/research-datasets",
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BuildResearchDatasetRegistryCommandError(
          "Missing value for --output-dir <path>",
        );
      }
      return next;
    }
  }

  return defaultDir;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
