import {
  DEFAULT_EXPANSION_FIXTURES_DIR,
  DEFAULT_EXPANSION_IMPORT_CONFIGS_DIR,
  DEFAULT_EXPANSION_IMPORTS_DIR,
  DEFAULT_EXPANSION_MISPRICING_ATLAS_PATH,
  DEFAULT_EXPANSION_REGISTRY_DIR,
  DEFAULT_EXPANSION_REBUILD_SUMMARY_HTML_PATH,
  DEFAULT_EXPANSION_REBUILD_SUMMARY_PATH,
  DEFAULT_EXPANSION_RESEARCH_RESULTS_DIR,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH,
} from "@/lib/data/research/expansionRebuild";

export class RebuildAfterExpansionCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RebuildAfterExpansionCommandError";
  }
}

export type RebuildAfterExpansionCommandIo = {
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
        throw new RebuildAfterExpansionCommandError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }

  return defaultValue;
}

function readBooleanFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function readConcurrency(argv: readonly string[]): number {
  const raw = readFlagValue(argv, "--concurrency", "1");
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new RebuildAfterExpansionCommandError(
      "--concurrency must be a positive integer",
    );
  }

  return parsed;
}

export function parseInputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--input", DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH);
}

export function parseOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--output", DEFAULT_EXPANSION_REBUILD_SUMMARY_PATH);
}

export function parseHtmlOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--html-output", DEFAULT_EXPANSION_REBUILD_SUMMARY_HTML_PATH);
}

export function parseFixturesDirFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--fixtures-dir", DEFAULT_EXPANSION_FIXTURES_DIR);
}

export function parseImportsDirFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--imports-dir", DEFAULT_EXPANSION_IMPORTS_DIR);
}

export function parseImportConfigsDirFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--import-configs-dir", DEFAULT_EXPANSION_IMPORT_CONFIGS_DIR);
}

export function parseRegistryDirFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--registry-dir", DEFAULT_EXPANSION_REGISTRY_DIR);
}

export function parseResearchResultsDirFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--research-results-dir", DEFAULT_EXPANSION_RESEARCH_RESULTS_DIR);
}

export function parseMispricingAtlasPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--mispricing-atlas", DEFAULT_EXPANSION_MISPRICING_ATLAS_PATH);
}

export function parseFullRebuildFromArgv(argv: readonly string[]): boolean {
  return readBooleanFlag(argv, "--full-rebuild");
}

export function parseConcurrencyFromArgv(argv: readonly string[]): number {
  return readConcurrency(argv);
}

export function formatStdoutOutput(payload: string): string {
  return `${payload}\n`;
}
