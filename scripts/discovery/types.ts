import type { FetchLike } from "@/lib/data/importers/kalshi";

import {
  DEFAULT_KXBTC15M_SERIES_TICKER,
  type KalshiHistoricalMarketDiscoveryOptions,
} from "@/lib/data/discovery";

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

export function parseSeriesFromArgv(
  argv: readonly string[],
  defaultSeries = DEFAULT_KXBTC15M_SERIES_TICKER,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--series") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new MarketDiscoveryCommandError("Missing value for --series <ticker>");
      }
      return next;
    }
  }

  return defaultSeries;
}

export function parseOutputPathFromArgv(argv: readonly string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new MarketDiscoveryCommandError("Missing value for --output <path>");
      }
      return next;
    }
  }

  throw new MarketDiscoveryCommandError("Missing required --output <path>");
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
