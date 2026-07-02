import type { FetchLike } from "@/lib/data/importers/kalshi";

import {
  DEFAULT_DISCOVERY_MAX_RETRIES,
  DEFAULT_DISCOVERY_REQUEST_DELAY_MS,
  DEFAULT_DISCOVERY_RETRY_BASE_DELAY_MS,
  DEFAULT_KXBTC15M_SERIES_TICKER,
  parseMarketDiscoveryRateLimitOptions,
  type KalshiHistoricalMarketDiscoveryOptions,
  type MarketDiscoveryRateLimitOptions,
  type MarketDiscoverySamplingOptions,
} from "@/lib/data/discovery";

export const DEFAULT_DISCOVERY_OUTPUT_PATH = "discovery-result.json";

export class MarketDiscoveryCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketDiscoveryCommandError";
  }
}

export type MarketDiscoveryCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
};

export type MarketDiscoveryCommandDeps = KalshiHistoricalMarketDiscoveryOptions;

export type RunMarketDiscoveryCommandOptions = {
  deps?: MarketDiscoveryCommandDeps;
  fetchImpl?: FetchLike;
};

function parseFlagValue(
  argv: readonly string[],
  flag: string,
  label: string,
): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new MarketDiscoveryCommandError(`Missing value for ${label}`);
      }
      return next;
    }
  }

  return undefined;
}

function parseIntegerFlag(
  argv: readonly string[],
  flag: string,
  label: string,
): number | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) {
      continue;
    }

    const next = argv[index + 1];
    if (next === undefined || (next.startsWith("-") && !/^-?\d+$/.test(next))) {
      throw new MarketDiscoveryCommandError(`Missing value for ${label}`);
    }

    if (!/^-?\d+$/.test(next.trim())) {
      throw new MarketDiscoveryCommandError(`${label} must be an integer`);
    }

    return Number(next);
  }

  return undefined;
}

export function parseSeriesFromArgv(
  argv: readonly string[],
  defaultSeries = DEFAULT_KXBTC15M_SERIES_TICKER,
): string {
  return parseFlagValue(argv, "--series", "--series <ticker>") ?? defaultSeries;
}

export function parseOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_DISCOVERY_OUTPUT_PATH,
): string {
  return parseFlagValue(argv, "--output", "--output <path>") ?? defaultPath;
}

export function parseLimitFromArgv(argv: readonly string[]): number | undefined {
  return parseIntegerFlag(argv, "--limit", "--limit <number>");
}

export function parseOffsetFromArgv(argv: readonly string[]): number | undefined {
  return parseIntegerFlag(argv, "--offset", "--offset <number>");
}

export function parseAfterFromArgv(argv: readonly string[]): string | undefined {
  return parseFlagValue(argv, "--after", "--after <ISO-8601 date>");
}

export function parseBeforeFromArgv(argv: readonly string[]): string | undefined {
  return parseFlagValue(argv, "--before", "--before <ISO-8601 date>");
}

export function parseRequestDelayMsFromArgv(argv: readonly string[]): number | undefined {
  return parseIntegerFlag(argv, "--request-delay-ms", "--request-delay-ms <number>");
}

export function parseMaxRetriesFromArgv(argv: readonly string[]): number | undefined {
  return parseIntegerFlag(argv, "--max-retries", "--max-retries <number>");
}

export function parseRetryBaseDelayMsFromArgv(argv: readonly string[]): number | undefined {
  return parseIntegerFlag(argv, "--retry-base-delay-ms", "--retry-base-delay-ms <number>");
}

export function parseRateLimitOptionsFromArgv(
  argv: readonly string[],
): MarketDiscoveryRateLimitOptions {
  const requestDelayMs = parseRequestDelayMsFromArgv(argv);
  const maxRetries = parseMaxRetriesFromArgv(argv);
  const retryBaseDelayMs = parseRetryBaseDelayMsFromArgv(argv);

  if (
    requestDelayMs === undefined
    && maxRetries === undefined
    && retryBaseDelayMs === undefined
  ) {
    return {};
  }

  const options: MarketDiscoveryRateLimitOptions = {
    requestDelayMs: requestDelayMs ?? DEFAULT_DISCOVERY_REQUEST_DELAY_MS,
    maxRetries: maxRetries ?? DEFAULT_DISCOVERY_MAX_RETRIES,
    retryBaseDelayMs: retryBaseDelayMs ?? DEFAULT_DISCOVERY_RETRY_BASE_DELAY_MS,
  };

  parseMarketDiscoveryRateLimitOptions(options);
  return options;
}

export function resolveCliRateLimitOptions(input: {
  argv: readonly string[];
  useProductionDefaults: boolean;
}): MarketDiscoveryRateLimitOptions | undefined {
  const explicit = parseRateLimitOptionsFromArgv(input.argv);
  if (Object.keys(explicit).length > 0) {
    return explicit;
  }

  if (!input.useProductionDefaults) {
    return undefined;
  }

  return {
    requestDelayMs: DEFAULT_DISCOVERY_REQUEST_DELAY_MS,
    maxRetries: DEFAULT_DISCOVERY_MAX_RETRIES,
    retryBaseDelayMs: DEFAULT_DISCOVERY_RETRY_BASE_DELAY_MS,
  };
}

export function parseSamplingOptionsFromArgv(
  argv: readonly string[],
): MarketDiscoverySamplingOptions {
  const limit = parseLimitFromArgv(argv);
  const offset = parseOffsetFromArgv(argv);
  const after = parseAfterFromArgv(argv);
  const before = parseBeforeFromArgv(argv);

  if (
    limit === undefined
    && offset === undefined
    && after === undefined
    && before === undefined
  ) {
    return {};
  }

  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { offset } : {}),
    ...(after !== undefined ? { after } : {}),
    ...(before !== undefined ? { before } : {}),
  };
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function buildDiscoveryStdoutSummary(input: {
  outputPath: string;
  marketCount: number;
  valid: boolean;
  sampling?: {
    totalDiscovered: number;
    afterDateFilter: number;
    offset: number;
    limit: number | null;
    finalMarketCount: number;
  };
  progress?: {
    earlyStopApplied: boolean;
    pagesFetched: number;
    limitTarget: number | null;
    totalDiscoveredMayBePartial: boolean;
  };
}): string {
  const summary = input.sampling ?? {
    totalDiscovered: input.marketCount,
    afterDateFilter: input.marketCount,
    offset: 0,
    limit: null,
    finalMarketCount: input.marketCount,
  };

  return JSON.stringify({
    outputPath: input.outputPath,
    marketCount: input.marketCount,
    valid: input.valid,
    totalDiscovered: summary.totalDiscovered,
    afterDateFilter: summary.afterDateFilter,
    offset: summary.offset,
    limit: summary.limit,
    finalMarketCount: summary.finalMarketCount,
    ...(input.progress
      ? {
          earlyStopApplied: input.progress.earlyStopApplied,
          pagesFetched: input.progress.pagesFetched,
          limitTarget: input.progress.limitTarget,
          totalDiscoveredMayBePartial: input.progress.totalDiscoveredMayBePartial,
        }
      : {}),
  });
}
