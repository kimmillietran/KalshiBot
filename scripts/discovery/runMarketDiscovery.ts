import { writeFileSync } from "node:fs";

import {
  createKalshiHistoricalMarketDiscoveryFromFetch,
  discoverKalshiHistoricalMarkets,
  serializeMarketDiscoveryResult,
} from "@/lib/data/discovery";
import type { FetchLike } from "@/lib/data/importers/kalshi";

import {
  buildDiscoveryStdoutSummary,
  formatStdoutOutput,
  MarketDiscoveryCommandError,
  parseOutputPathFromArgv,
  parseSamplingOptionsFromArgv,
  parseSeriesFromArgv,
  resolveCliRateLimitOptions,
} from "./types";
import { normalizeDiscoveryCliArgv } from "./normalizeDiscoveryCliArgv";
import type {
  MarketDiscoveryCommandDeps,
  MarketDiscoveryCommandIo,
  RunMarketDiscoveryCommandOptions,
} from "./types";

function normalizeCommandOptions(
  options?: MarketDiscoveryCommandDeps | RunMarketDiscoveryCommandOptions,
): RunMarketDiscoveryCommandOptions {
  if (!options) {
    return {};
  }

  if ("importer" in options) {
    return { deps: options };
  }

  return options;
}

export function runMarketDiscoveryCommand(
  argv: readonly string[],
  io: MarketDiscoveryCommandIo,
  options?: MarketDiscoveryCommandDeps | RunMarketDiscoveryCommandOptions,
): Promise<number> {
  try {
    const normalizedArgv = normalizeDiscoveryCliArgv(argv);
    const seriesTicker = parseSeriesFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const sampling = parseSamplingOptionsFromArgv(normalizedArgv);
    const { deps, fetchImpl } = normalizeCommandOptions(options);

    const baseDiscoveryOptions =
      deps ?? createKalshiHistoricalMarketDiscoveryFromFetch(
        resolveFetchImpl(fetchImpl),
      );
    const rateLimit = resolveCliRateLimitOptions({
      argv: normalizedArgv,
      useProductionDefaults: !deps,
    });

    const discoveryOptions = {
      ...baseDiscoveryOptions,
      ...(rateLimit ? { rateLimit } : {}),
      logRateLimitWarning: (message: string) => {
        io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
      },
    };

    return discoverKalshiHistoricalMarkets(
      {
        seriesTicker,
        ...(Object.keys(sampling).length > 0 ? { sampling } : {}),
      },
      discoveryOptions,
    ).then(
      (result) => {
        const serialized = serializeMarketDiscoveryResult(result);
        io.writeFile(outputPath, serialized);
        io.writeStdout(
          formatStdoutOutput(
            buildDiscoveryStdoutSummary({
              outputPath,
              marketCount: result.metadata.marketCount,
              valid: result.validation.valid,
              sampling: result.metadata.sampling,
            }),
          ),
        );
        return 0;
      },
      (error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Market discovery command failed";
        io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
        return 1;
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Market discovery command failed";
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return Promise.resolve(1);
  }
}

function resolveFetchImpl(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof globalThis.fetch !== "function") {
    throw new MarketDiscoveryCommandError(
      "fetchImpl is required when global fetch is unavailable",
    );
  }

  return globalThis.fetch.bind(globalThis);
}

async function main(): Promise<void> {
  const exitCode = await runMarketDiscoveryCommand(process.argv.slice(2), {
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
    writeFile: (path, data) => {
      writeFileSync(path, data, "utf8");
    },
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  void main();
}

export {
  buildDiscoveryStdoutSummary,
  formatStdoutOutput,
  MarketDiscoveryCommandError,
  parseAfterFromArgv,
  parseBeforeFromArgv,
  parseLimitFromArgv,
  parseMaxRetriesFromArgv,
  parseOffsetFromArgv,
  parseOutputPathFromArgv,
  parseRateLimitOptionsFromArgv,
  parseRequestDelayMsFromArgv,
  parseRetryBaseDelayMsFromArgv,
  parseSamplingOptionsFromArgv,
  parseSeriesFromArgv,
  resolveCliRateLimitOptions,
} from "./types";
export { normalizeDiscoveryCliArgv } from "./normalizeDiscoveryCliArgv";
