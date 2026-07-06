import {
  DEFAULT_EXPANSION_FIXTURES_DIR,
  DEFAULT_EXPANSION_IMPORT_CONFIGS_DIR,
  DEFAULT_EXPANSION_IMPORTS_DIR,
  DEFAULT_EXPANSION_MAX_RATE_LIMIT_RETRIES,
  DEFAULT_EXPANSION_RATE_LIMIT_BACKOFF_MS,
  DEFAULT_EXPANSION_RESEARCH_RESULTS_DIR,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_CHECKPOINT_PATH,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_CONFIG_PATH,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_HTML_PATH,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH,
  DEFAULT_SINGLE_MARKET_EXPANSION_IMPORT_DEBUG_HTML_PATH,
  DEFAULT_SINGLE_MARKET_EXPANSION_IMPORT_DEBUG_JSON_PATH,
  type HistoricalExpansionImportExecutorConfig,
} from "@/lib/data/importJobs/expansionExecutor";
import {
  DEFAULT_EXPANSION_ADAPTIVE_MAX_BACKOFF_MS,
  DEFAULT_EXPANSION_ADAPTIVE_MIN_BACKOFF_MS,
  DEFAULT_EXPANSION_BACKOFF_MULTIPLIER,
  DEFAULT_EXPANSION_SUCCESS_DECAY_AFTER,
} from "@/lib/data/importJobs/expansionExecutor/expansionImportAdaptiveThrottle";
import { DEFAULT_EXPANSION_BATCH_PLAN_OUTPUT_PATH } from "@/lib/data/research/expansionBatchPlanner";
import {
  DEFAULT_DISCOVERY_CACHE_SEGMENT,
  DEFAULT_DISCOVERY_CACHE_TTL_HOURS,
  DEFAULT_EXPANSION_DISCOVERY_CACHE_DIR,
  DISCOVERY_CACHE_SEGMENT_STRATEGIES,
  type DiscoveryCacheSegmentStrategy,
} from "@/lib/data/importJobs/expansionExecutor/expansionDiscoveryCache";
import {
  DEFAULT_EXPANSION_IMPORT_SAMPLE_STRATEGY,
  EXPANSION_IMPORT_SAMPLE_STRATEGIES,
  type ExpansionImportSampleStrategy,
} from "@/lib/data/importJobs/expansionExecutor/expansionImportSelectionTypes";
import { ExpansionExecutorError } from "@/lib/data/importJobs/expansionExecutor/expansionExecutorTypes";
import { SingleMarketExpansionImportDebugError } from "@/lib/data/importJobs/expansionExecutor/singleMarketExpansionImportDebugTypes";

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

function readOptionalBatchPlanPath(argv: readonly string[]): string | null {
  const flagIndex = argv.indexOf("--batch-plan");
  if (flagIndex === -1) {
    return null;
  }

  const next = argv[flagIndex + 1];
  if (!next || next.startsWith("-")) {
    return DEFAULT_EXPANSION_BATCH_PLAN_OUTPUT_PATH;
  }

  return next;
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

function readSampleStrategyFlag(argv: readonly string[]): ExpansionImportSampleStrategy {
  const raw = readOptionalFlag(argv, "--sample-strategy");
  if (raw === null) {
    return DEFAULT_EXPANSION_IMPORT_SAMPLE_STRATEGY;
  }

  if (
    !(EXPANSION_IMPORT_SAMPLE_STRATEGIES as readonly string[]).includes(raw)
  ) {
    throw new ExecuteExpansionImportCommandError(
      `Invalid value for --sample-strategy: ${raw}. Expected one of: ${EXPANSION_IMPORT_SAMPLE_STRATEGIES.join(", ")}`,
    );
  }

  return raw as ExpansionImportSampleStrategy;
}

function readDiscoveryCacheSegmentFlag(argv: readonly string[]): DiscoveryCacheSegmentStrategy {
  const raw = readOptionalFlag(argv, "--discovery-cache-segment");
  if (raw === null) {
    return DEFAULT_DISCOVERY_CACHE_SEGMENT;
  }

  if (!(DISCOVERY_CACHE_SEGMENT_STRATEGIES as readonly string[]).includes(raw)) {
    throw new ExecuteExpansionImportCommandError(
      `Invalid value for --discovery-cache-segment: ${raw}. Expected one of: ${DISCOVERY_CACHE_SEGMENT_STRATEGIES.join(", ")}`,
    );
  }

  return raw as DiscoveryCacheSegmentStrategy;
}

function readRefreshDiscoveryMonthFlag(argv: readonly string[]): string | null {
  const raw = readOptionalFlag(argv, "--refresh-discovery-month");
  if (raw === null) {
    return null;
  }

  if (!/^\d{4}-\d{2}$/.test(raw)) {
    throw new ExecuteExpansionImportCommandError(
      `Invalid value for --refresh-discovery-month: ${raw}. Expected YYYY-MM.`,
    );
  }

  return raw;
}

function readDiscoveryCacheTtlHoursFlag(argv: readonly string[]): number | null {
  const raw = readOptionalFlag(argv, "--discovery-cache-ttl-hours");
  if (raw === null) {
    return DEFAULT_DISCOVERY_CACHE_TTL_HOURS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ExecuteExpansionImportCommandError(
      `Invalid value for --discovery-cache-ttl-hours: ${raw}`,
    );
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
    marketTicker: readOptionalFlag(argv, "--market-ticker"),
    singleMarketOutputPath: readFlagValue(
      argv,
      "--single-market-output",
      DEFAULT_SINGLE_MARKET_EXPANSION_IMPORT_DEBUG_JSON_PATH,
    ),
    singleMarketHtmlOutputPath: readFlagValue(
      argv,
      "--single-market-html-output",
      DEFAULT_SINGLE_MARKET_EXPANSION_IMPORT_DEBUG_HTML_PATH,
    ),
    rateLimitBackoffMs:
      readOptionalNumberFlag(argv, "--rate-limit-backoff-ms")
      ?? DEFAULT_EXPANSION_RATE_LIMIT_BACKOFF_MS,
    maxRateLimitRetries:
      readOptionalNumberFlag(argv, "--max-rate-limit-retries")
      ?? DEFAULT_EXPANSION_MAX_RATE_LIMIT_RETRIES,
    sampleStrategy: readSampleStrategyFlag(argv),
    adaptiveThrottle: readBooleanFlag(argv, "--adaptive-throttle"),
    minBackoffMs:
      readOptionalNumberFlag(argv, "--min-backoff-ms")
      ?? DEFAULT_EXPANSION_ADAPTIVE_MIN_BACKOFF_MS,
    maxBackoffMs:
      readOptionalNumberFlag(argv, "--max-backoff-ms")
      ?? DEFAULT_EXPANSION_ADAPTIVE_MAX_BACKOFF_MS,
    backoffMultiplier:
      readOptionalNumberFlag(argv, "--backoff-multiplier")
      ?? DEFAULT_EXPANSION_BACKOFF_MULTIPLIER,
    successDecayAfter:
      readOptionalNumberFlag(argv, "--success-decay-after")
      ?? DEFAULT_EXPANSION_SUCCESS_DECAY_AFTER,
    retryFailed: readBooleanFlag(argv, "--retry-failed"),
    retryUnsupported: readBooleanFlag(argv, "--retry-unsupported"),
    verifyResumeArtifacts: readBooleanFlag(argv, "--verify-resume-artifacts"),
    discoveryCacheDir: readFlagValue(
      argv,
      "--discovery-cache-dir",
      DEFAULT_EXPANSION_DISCOVERY_CACHE_DIR,
    ),
    discoveryCacheSegment: readDiscoveryCacheSegmentFlag(argv),
    discoveryCacheTtlHours: readDiscoveryCacheTtlHoursFlag(argv),
    useDiscoveryCache: !argv.includes("--no-use-discovery-cache"),
    refreshDiscoveryCache: readBooleanFlag(argv, "--refresh-discovery-cache"),
    refreshDiscoveryMonth: readRefreshDiscoveryMonthFlag(argv),
    batchPlanPath: readOptionalBatchPlanPath(argv),
  };
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (
    error instanceof ExecuteExpansionImportCommandError
    || error instanceof ExpansionExecutorError
    || error instanceof SingleMarketExpansionImportDebugError
  ) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Historical expansion import execution failed";
}
