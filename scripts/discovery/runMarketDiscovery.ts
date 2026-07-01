import { writeFileSync } from "node:fs";

import {
  createKalshiHistoricalMarketDiscoveryFromFetch,
  discoverKalshiHistoricalMarkets,
  serializeMarketDiscoveryResult,
} from "@/lib/data/discovery";
import type { FetchLike } from "@/lib/data/importers/kalshi";

import {
  formatStdoutOutput,
  MarketDiscoveryCommandError,
  parseOutputPathFromArgv,
  parseSeriesFromArgv,
} from "./types";
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
    const seriesTicker = parseSeriesFromArgv(argv);
    const outputPath = parseOutputPathFromArgv(argv);
    const { deps, fetchImpl } = normalizeCommandOptions(options);

    const discoveryOptions =
      deps ?? createKalshiHistoricalMarketDiscoveryFromFetch(
        resolveFetchImpl(fetchImpl),
      );

    return discoverKalshiHistoricalMarkets({ seriesTicker }, discoveryOptions).then(
      (result) => {
        const serialized = serializeMarketDiscoveryResult(result);
        io.writeFile(outputPath, serialized);
        io.writeStdout(
          formatStdoutOutput(
            JSON.stringify({
              outputPath,
              marketCount: result.metadata.marketCount,
              valid: result.validation.valid,
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
  formatStdoutOutput,
  MarketDiscoveryCommandError,
  parseOutputPathFromArgv,
  parseSeriesFromArgv,
} from "./types";
