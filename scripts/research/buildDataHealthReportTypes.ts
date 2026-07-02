import {
  DEFAULT_DATA_HEALTH_OUTPUT_PATH,
  DEFAULT_DISCOVERY_RESULT_PATH,
  DEFAULT_FIXTURES_DIR,
  DEFAULT_IMPORT_CONFIGS_DIR,
  DEFAULT_IMPORTS_DIR,
  DEFAULT_LEADERBOARD_PATH,
  DEFAULT_REGISTRY_DIR,
  DEFAULT_REPORT_HTML_PATH,
  DEFAULT_RESEARCH_RESULTS_DIR,
} from "@/lib/data/research/dataHealth";

export class DataHealthCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataHealthCommandError";
  }
}

export type DataHealthCommandIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  getLastModified: (path: string) => string | null;
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
        throw new DataHealthCommandError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }
  return defaultValue;
}

export function parseDiscoveryResultPathFromArgv(
  argv: readonly string[],
): string {
  return readFlagValue(argv, "--discovery-result", DEFAULT_DISCOVERY_RESULT_PATH);
}

export function parseImportsDirFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--imports-dir", DEFAULT_IMPORTS_DIR);
}

export function parseImportConfigsDirFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--import-configs-dir", DEFAULT_IMPORT_CONFIGS_DIR);
}

export function parseFixturesDirFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--fixtures-dir", DEFAULT_FIXTURES_DIR);
}

export function parseRegistryDirFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--registry-dir", DEFAULT_REGISTRY_DIR);
}

export function parseResearchResultsDirFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--research-results-dir", DEFAULT_RESEARCH_RESULTS_DIR);
}

export function parseLeaderboardPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--leaderboard", DEFAULT_LEADERBOARD_PATH);
}

export function parseReportHtmlPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--report-html", DEFAULT_REPORT_HTML_PATH);
}

export function parseOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--output", DEFAULT_DATA_HEALTH_OUTPUT_PATH);
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof DataHealthCommandError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Data health report build failed";
}
