import {
  DEFAULT_DATA_HEALTH_INPUT_PATH,
  DEFAULT_EXPANSION_IMPORT_SUMMARY_INPUT_PATH,
  DEFAULT_FIXTURES_DIR,
  DEFAULT_HISTORICAL_COVERAGE_PLAN_HTML_PATH,
  DEFAULT_HISTORICAL_COVERAGE_PLAN_OUTPUT_PATH,
  DEFAULT_HYPOTHESIS_VALIDATION_INPUT_PATH,
  DEFAULT_IMPORT_CONFIGS_DIR,
  DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
  DEFAULT_MONTH_PERSISTENCE_THRESHOLD,
  DEFAULT_MIN_MARKETS_PER_MONTH,
  DEFAULT_MIN_TRADING_DAYS_PER_MONTH,
  DEFAULT_REGIME_TAGS_INPUT_PATH,
  DEFAULT_RESEARCH_RESULTS_DIR,
  type HistoricalCoveragePlanConfig,
} from "@/lib/data/research/coveragePlanner";
import { parseCalendarMonth } from "@/lib/data/research/coveragePlanner/coveragePlannerDateUtils";
import { CoveragePlannerError } from "@/lib/data/research/coveragePlanner/coveragePlannerTypes";

export class HistoricalCoveragePlanCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoricalCoveragePlanCommandError";
  }
}

export type HistoricalCoveragePlanCommandIo = {
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
        throw new HistoricalCoveragePlanCommandError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }
  return defaultValue;
}

function readNumberFlagValue(
  argv: readonly string[],
  flag: string,
  defaultValue: number,
): number {
  const raw = readFlagValue(argv, flag, String(defaultValue));
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new HistoricalCoveragePlanCommandError(`Invalid numeric value for ${flag}: ${raw}`);
  }
  return parsed;
}

function readOptionalCalendarMonthFlag(argv: readonly string[]): string | undefined {
  const flag = "--earliest-month";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HistoricalCoveragePlanCommandError(`Missing value for ${flag} <YYYY-MM>`);
      }
      try {
        return parseCalendarMonth(next, "earliest month");
      } catch (error) {
        throw new HistoricalCoveragePlanCommandError(
          error instanceof Error ? error.message : `Invalid value for ${flag}`,
        );
      }
    }
  }

  return undefined;
}

export function parseHistoricalCoveragePlanConfigFromArgv(
  argv: readonly string[],
): HistoricalCoveragePlanConfig {
  const config: HistoricalCoveragePlanConfig = {
    outputPath: readFlagValue(argv, "--output", DEFAULT_HISTORICAL_COVERAGE_PLAN_OUTPUT_PATH),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_HISTORICAL_COVERAGE_PLAN_HTML_PATH,
    ),
    dataHealthPath: readFlagValue(argv, "--data-health", DEFAULT_DATA_HEALTH_INPUT_PATH),
    mispricingAtlasPath: readFlagValue(
      argv,
      "--mispricing-atlas",
      DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
    ),
    hypothesisValidationPath: readFlagValue(
      argv,
      "--hypothesis-validation",
      DEFAULT_HYPOTHESIS_VALIDATION_INPUT_PATH,
    ),
    regimeTagsPath: readFlagValue(argv, "--regime-tags", DEFAULT_REGIME_TAGS_INPUT_PATH),
    expansionImportSummaryPath: readFlagValue(
      argv,
      "--expansion-import-summary",
      DEFAULT_EXPANSION_IMPORT_SUMMARY_INPUT_PATH,
    ),
    importConfigsDir: readFlagValue(argv, "--import-configs-dir", DEFAULT_IMPORT_CONFIGS_DIR),
    fixturesDir: readFlagValue(argv, "--fixtures-dir", DEFAULT_FIXTURES_DIR),
    researchResultsDir: readFlagValue(
      argv,
      "--research-results-dir",
      DEFAULT_RESEARCH_RESULTS_DIR,
    ),
    monthPersistenceThreshold: readNumberFlagValue(
      argv,
      "--month-persistence-threshold",
      DEFAULT_MONTH_PERSISTENCE_THRESHOLD,
    ),
    minMarketsPerMonth: readNumberFlagValue(
      argv,
      "--min-markets-per-month",
      DEFAULT_MIN_MARKETS_PER_MONTH,
    ),
    minTradingDaysPerMonth: readNumberFlagValue(
      argv,
      "--min-trading-days-per-month",
      DEFAULT_MIN_TRADING_DAYS_PER_MONTH,
    ),
    alignImportWindowsToMonthSegments: !argv.includes("--no-align-import-windows-to-months"),
  };

  const earliestMonth = readOptionalCalendarMonthFlag(argv);
  if (earliestMonth) {
    config.earliestMonth = earliestMonth;
  }

  return config;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (
    error instanceof HistoricalCoveragePlanCommandError
    || error instanceof CoveragePlannerError
  ) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Historical coverage plan build failed";
}
