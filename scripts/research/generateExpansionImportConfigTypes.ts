import {
  DEFAULT_HISTORICAL_COVERAGE_PLAN_PATH,
  DEFAULT_HISTORICAL_EXPANSION_CONFIG_HTML_PATH,
  DEFAULT_HISTORICAL_EXPANSION_CONFIG_PATH,
} from "@/lib/data/importJobs/expansionConfig";

export class GenerateExpansionImportConfigCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerateExpansionImportConfigCommandError";
  }
}

export type GenerateExpansionImportConfigCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

function readFlagValue(argv: readonly string[], flag: string, defaultValue: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new GenerateExpansionImportConfigCommandError(
          `Missing value for ${flag} <path>`,
        );
      }
      return next;
    }
  }

  return defaultValue;
}

function readBooleanFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

export function parseInputPathFromArgv(
  argv: readonly string[],
): string {
  return readFlagValue(argv, "--input", DEFAULT_HISTORICAL_COVERAGE_PLAN_PATH);
}

export function parseOutputPathFromArgv(
  argv: readonly string[],
): string {
  return readFlagValue(argv, "--output", DEFAULT_HISTORICAL_EXPANSION_CONFIG_PATH);
}

export function parseHtmlOutputPathFromArgv(
  argv: readonly string[],
): string {
  return readFlagValue(
    argv,
    "--html-output",
    DEFAULT_HISTORICAL_EXPANSION_CONFIG_HTML_PATH,
  );
}

export function parseImportConfigsDirFromArgv(
  argv: readonly string[],
): string {
  return readFlagValue(argv, "--import-configs-dir", "data/import-configs");
}

export function parseDryRunFromArgv(argv: readonly string[]): boolean {
  return readBooleanFlag(argv, "--dry-run");
}

/** @deprecated Use parseDryRunFromArgv; write is now the default. */
export function parseWriteFromArgv(argv: readonly string[]): boolean {
  return readBooleanFlag(argv, "--write");
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
