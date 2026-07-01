export class GenerateImportConfigsCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerateImportConfigsCommandError";
  }
}

export type GenerateImportConfigsCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
};

export function parseInputPathFromArgv(argv: readonly string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new GenerateImportConfigsCommandError(
          "Missing value for --input <path>",
        );
      }
      return next;
    }
  }

  throw new GenerateImportConfigsCommandError(
    "Missing required --input <path>",
  );
}

export function parseOutputDirFromArgv(
  argv: readonly string[],
  defaultOutputDir = "data/import-configs",
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new GenerateImportConfigsCommandError(
          "Missing value for --output-dir <path>",
        );
      }
      return next;
    }
  }

  return defaultOutputDir;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
