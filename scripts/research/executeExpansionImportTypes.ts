import {
  DEFAULT_EXPANSION_FIXTURES_DIR,
  DEFAULT_EXPANSION_IMPORT_CONFIGS_DIR,
  DEFAULT_EXPANSION_IMPORTS_DIR,
  DEFAULT_EXPANSION_RESEARCH_RESULTS_DIR,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_CHECKPOINT_PATH,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_CONFIG_PATH,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_HTML_PATH,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH,
  type HistoricalExpansionImportExecutorConfig,
} from "@/lib/data/importJobs/expansionExecutor";
import { ExpansionExecutorError } from "@/lib/data/importJobs/expansionExecutor/expansionExecutorTypes";

export class ExecuteExpansionImportCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecuteExpansionImportCommandError";
  }
}

export type ExecuteExpansionImportCommandIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
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
        throw new ExecuteExpansionImportCommandError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }

  return defaultValue;
}

function readOptionalFlag(argv: readonly string[], flag: string): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new ExecuteExpansionImportCommandError(`Missing value for ${flag} <value>`);
      }
      return next;
    }
  }

  return null;
}

function readBooleanFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function readOptionalNumberFlag(argv: readonly string[], flag: string): number | null {
  const raw = readOptionalFlag(argv, flag);
  if (raw === null) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ExecuteExpansionImportCommandError(`Invalid numeric value for ${flag}: ${raw}`);
  }

  return parsed;
}

export function parseExecuteExpansionImportConfigFromArgv(
  argv: readonly string[],
): HistoricalExpansionImportExecutorConfig {
  return {
    inputPath: readFlagValue(
      argv,
      "--input",
      DEFAULT_HISTORICAL_EXPANSION_IMPORT_CONFIG_PATH,
    ),
    outputPath: readFlagValue(
      argv,
      "--output",
      DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH,
    ),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_HTML_PATH,
    ),
    importConfigsDir: readFlagValue(
      argv,
      "--import-configs-dir",
      DEFAULT_EXPANSION_IMPORT_CONFIGS_DIR,
    ),
    importsDir: readFlagValue(argv, "--imports-dir", DEFAULT_EXPANSION_IMPORTS_DIR),
    fixturesDir: readFlagValue(argv, "--fixtures-dir", DEFAULT_EXPANSION_FIXTURES_DIR),
    researchResultsDir: readFlagValue(
      argv,
      "--research-results-dir",
      DEFAULT_EXPANSION_RESEARCH_RESULTS_DIR,
    ),
    checkpointPath: readFlagValue(
      argv,
      "--checkpoint-path",
      DEFAULT_HISTORICAL_EXPANSION_IMPORT_CHECKPOINT_PATH,
    ),
    summaryInputPath: readOptionalFlag(argv, "--summary-input"),
    execute: readBooleanFlag(argv, "--execute"),
    resume: readBooleanFlag(argv, "--resume"),
    skipFailed: readBooleanFlag(argv, "--skip-failed"),
    forceMarket: readOptionalFlag(argv, "--force-market"),
    maxMarkets: readOptionalNumberFlag(argv, "--max-markets"),
    maxRetries: readOptionalNumberFlag(argv, "--max-retries") ?? 0,
    jobId: readOptionalFlag(argv, "--job-id"),
    traceMarket: readOptionalFlag(argv, "--trace-market"),
  };
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (
    error instanceof ExecuteExpansionImportCommandError
    || error instanceof ExpansionExecutorError
  ) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Historical expansion import execution failed";
}
