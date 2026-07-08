import {
  DEFAULT_OFFICIAL_MONTH_EXPANSION_REFRESH_HTML_OUTPUT_PATH,
  DEFAULT_OFFICIAL_MONTH_EXPANSION_REFRESH_OUTPUT_PATH,
  OfficialMonthExpansionRefreshError,
  buildDefaultOfficialMonthExpansionRefreshInputPaths,
  type OfficialMonthExpansionRefreshInputPaths,
} from "@/lib/data/research/officialMonthExpansionRefresh";

export class OfficialMonthExpansionRefreshCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficialMonthExpansionRefreshCommandError";
  }
}

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      return argv[index + 1];
    }
  }

  return undefined;
}

export function readOptionalFlag(argv: readonly string[], flag: string): string | undefined {
  return readFlagValue(argv, flag);
}

export function parseOutputPathFromArgv(argv: readonly string[]): string {
  return (
    readFlagValue(argv, "--output") ?? DEFAULT_OFFICIAL_MONTH_EXPANSION_REFRESH_OUTPUT_PATH
  );
}

export function parseHtmlOutputPathFromArgv(argv: readonly string[]): string {
  return (
    readFlagValue(argv, "--html-output")
    ?? DEFAULT_OFFICIAL_MONTH_EXPANSION_REFRESH_HTML_OUTPUT_PATH
  );
}

export function parseExecuteImportFromArgv(argv: readonly string[]): boolean {
  return argv.includes("--execute-import");
}

export function parseRerunEvidenceChainFromArgv(argv: readonly string[]): boolean {
  return argv.includes("--rerun-evidence-chain");
}

export function parseInputPathsFromArgv(argv: readonly string[]): OfficialMonthExpansionRefreshInputPaths {
  const researchResultsDir = readFlagValue(argv, "--research-results-dir");

  return buildDefaultOfficialMonthExpansionRefreshInputPaths(
    researchResultsDir ? { researchResultsDir } : undefined,
  );
}

export function formatStdoutOutput(payload: string): string {
  return `${payload}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof OfficialMonthExpansionRefreshCommandError) {
    return error.message;
  }

  if (error instanceof OfficialMonthExpansionRefreshError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Official month expansion refresh failed";
}

export type OfficialMonthExpansionRefreshCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
  runCommand: (
    command: string,
    options?: { cwd?: string },
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
};
