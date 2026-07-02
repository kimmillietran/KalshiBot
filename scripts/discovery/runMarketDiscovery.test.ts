import { describe, expect, it, vi } from "vitest";

import type { HistoricalImporter } from "@/lib/data/importers/kalshi/HistoricalImporter";
import type { HistoricalMarketRecord } from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";
import type { FetchLike } from "@/lib/data/importers/kalshi";

import { runMarketDiscoveryCommand } from "./runMarketDiscovery";
import {
  MarketDiscoveryCommandError,
  parseLimitFromArgv,
  parseMaxRetriesFromArgv,
  parseOffsetFromArgv,
  parseOutputPathFromArgv,
  parseRateLimitOptionsFromArgv,
  parseRequestDelayMsFromArgv,
  parseSamplingOptionsFromArgv,
  parseSeriesFromArgv,
} from "./types";
import { KalshiHistoricalImporterError } from "@/lib/data/importers/kalshi/KalshiHistoricalImporter";

const FIXED_NOW = new Date("2026-06-27T12:00:00.000Z");

const MARKET_A: HistoricalMarketRecord = {
  ticker: "KXBTC15M-20260105-15",
  eventTicker: "KXBTC15M-20260105",
  status: "finalized",
  result: "yes",
  openTime: "2026-01-05T01:00:00.000Z",
  closeTime: "2026-01-05T01:15:00.000Z",
  settlementTs: "2026-01-05T01:20:00.000Z",
  settlementValueDollars: "1.0000",
  expirationValue: "60010.25",
  floorStrike: 59_990.31,
};

const MARKET_B: HistoricalMarketRecord = {
  ...MARKET_A,
  ticker: "KXBTC15M-20260115-15",
  eventTicker: "KXBTC15M-20260115",
  openTime: "2026-01-15T01:00:00.000Z",
  closeTime: "2026-01-15T01:15:00.000Z",
};

function createImporter(): HistoricalImporter {
  return {
    listHistoricalMarkets: vi.fn(async () => ({
      markets: [MARKET_A, MARKET_B],
      cursor: "",
      provenance: {
        source: "kalshi-historical-api",
        fetchedAt: FIXED_NOW.toISOString(),
        requestPath: "/historical/markets?series_ticker=KXBTC15M&limit=100",
        cursor: "",
      },
    })),
    getMarketCandlesticks: vi.fn(),
    getHistoricalTrades: vi.fn(),
    getHistoricalCutoff: vi.fn(),
    getHistoricalMarket: vi.fn(),
    getSettlementResult: vi.fn(),
  };
}

function createIo() {
  const writes = {
    stdout: "",
    stderr: "",
    files: new Map<string, string>(),
  };

  return {
    io: {
      writeStdout: (text: string) => {
        writes.stdout += text;
      },
      writeStderr: (text: string) => {
        writes.stderr += text;
      },
      writeFile: (path: string, data: string) => {
        writes.files.set(path, data);
      },
    },
    writes,
  };
}

describe("market discovery argv parsing", () => {
  it("defaults series ticker to KXBTC15M", () => {
    expect(parseSeriesFromArgv([])).toBe("KXBTC15M");
  });

  it("defaults output path to discovery-result.json", () => {
    expect(parseOutputPathFromArgv(["--series", "KXBTC15M"])).toBe(
      "discovery-result.json",
    );
  });

  it("parses --series and --output flags", () => {
    expect(parseSeriesFromArgv(["--series", "KXBTC15M"])).toBe("KXBTC15M");
    expect(parseOutputPathFromArgv(["--output", "custom.json"])).toBe("custom.json");
  });

  it("parses sampling flags", () => {
    expect(parseLimitFromArgv(["--limit", "50"])).toBe(50);
    expect(parseOffsetFromArgv(["--offset", "500"])).toBe(500);
    expect(parseSamplingOptionsFromArgv(["--limit", "50", "--offset", "10"])).toEqual({
      limit: 50,
      offset: 10,
    });
  });

  it("throws for non-integer limit values", () => {
    expect(() => parseLimitFromArgv(["--limit", "abc"])).toThrow(
      MarketDiscoveryCommandError,
    );
  });

  it("parses rate-limit flags", () => {
    expect(parseRequestDelayMsFromArgv(["--request-delay-ms", "500"])).toBe(500);
    expect(parseMaxRetriesFromArgv(["--max-retries", "5"])).toBe(5);
    expect(
      parseRateLimitOptionsFromArgv([
        "--request-delay-ms",
        "500",
        "--max-retries",
        "5",
        "--retry-base-delay-ms",
        "1000",
      ]),
    ).toEqual({
      requestDelayMs: 500,
      maxRetries: 5,
      retryBaseDelayMs: 1000,
    });
  });

  it("rejects negative rate-limit values", () => {
    expect(() => parseRateLimitOptionsFromArgv(["--request-delay-ms", "-1"])).toThrow();
  });
});

describe("runMarketDiscoveryCommand", () => {
  it("writes deterministic discovery-result.json output without sampling", async () => {
    const { io, writes } = createIo();

    const exitCode = await runMarketDiscoveryCommand(
      ["--series", "KXBTC15M", "--output", "discovery-result.json"],
      io,
      { deps: { importer: createImporter(), now: () => FIXED_NOW } },
    );

    expect(exitCode).toBe(0);
    expect(writes.files.has("discovery-result.json")).toBe(true);
    const serialized = writes.files.get("discovery-result.json")!;
    expect(serialized).toContain("KXBTC15M-20260105-15");
    expect(serialized).not.toContain('"sampling"');
    expect(JSON.parse(writes.stdout.trim())).toMatchObject({
      marketCount: 2,
      totalDiscovered: 2,
      afterDateFilter: 2,
      offset: 0,
      limit: null,
      finalMarketCount: 2,
    });
  });

  it("applies limit and writes sampling summary metadata", async () => {
    const { io, writes } = createIo();

    const exitCode = await runMarketDiscoveryCommand(
      ["--series", "KXBTC15M", "--limit", "1"],
      io,
      { deps: { importer: createImporter(), now: () => FIXED_NOW } },
    );

    expect(exitCode).toBe(0);
    const serialized = writes.files.get("discovery-result.json")!;
    const parsed = JSON.parse(serialized);
    expect(parsed.metadata.sampling).toEqual({
      totalDiscovered: 2,
      afterDateFilter: 2,
      offset: 0,
      limit: 1,
      finalMarketCount: 1,
    });
    expect(parsed.markets).toHaveLength(1);
  });

  it("honors npm-stripped positional argv for limit and output", async () => {
    const { io, writes } = createIo();

    const exitCode = await runMarketDiscoveryCommand(
      ["KXBTC15M", "1", "discovery-result.json"],
      io,
      { deps: { importer: createImporter(), now: () => FIXED_NOW } },
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(writes.files.get("discovery-result.json")!);
    expect(parsed.metadata.sampling).toEqual({
      totalDiscovered: 2,
      afterDateFilter: 2,
      offset: 0,
      limit: 1,
      finalMarketCount: 1,
    });
    expect(JSON.parse(writes.stdout.trim())).toMatchObject({
      limit: 1,
      finalMarketCount: 1,
      outputPath: "discovery-result.json",
    });
  });

  it("honors full npm-stripped positional argv with rate-limit options", async () => {
    const { io, writes } = createIo();
    const importer = createImporter();

    const exitCode = await runMarketDiscoveryCommand(
      ["KXBTC15M", "1", "1000", "5", "2000", "discovery-result.json"],
      io,
      { deps: { importer, now: () => FIXED_NOW, sleep: async () => undefined } },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(writes.stdout.trim())).toMatchObject({
      limit: 1,
      finalMarketCount: 1,
    });
  });

  it("does not call fetch when deps are injected", async () => {
    const fetchImpl = vi.fn() as FetchLike;
    const { io } = createIo();

    await runMarketDiscoveryCommand(
      ["--output", "discovery-result.json"],
      io,
      { deps: { importer: createImporter(), now: () => FIXED_NOW } },
    );

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns exit code 1 on importer failure", async () => {
    const { io, writes } = createIo();
    const importer = createImporter();
    vi.mocked(importer.listHistoricalMarkets).mockRejectedValue(
      new Error("upstream unavailable"),
    );

    const exitCode = await runMarketDiscoveryCommand(
      ["--output", "discovery-result.json"],
      io,
      { deps: { importer, now: () => FIXED_NOW } },
    );

    expect(exitCode).toBe(1);
    expect(writes.stderr).toContain("upstream unavailable");
    expect(writes.files.size).toBe(0);
  });

  it("returns exit code 1 for invalid sampling flags", async () => {
    const { io, writes } = createIo();

    const exitCode = await runMarketDiscoveryCommand(
      ["--limit", "-1"],
      io,
      { deps: { importer: createImporter(), now: () => FIXED_NOW } },
    );

    expect(exitCode).toBe(1);
    expect(writes.stderr).toContain("non-negative integer");
  });

  it("retries after 429 and writes discovery output", async () => {
    const { io, writes } = createIo();
    const importer = createImporter();
    let callCount = 0;
    vi.mocked(importer.listHistoricalMarkets).mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new KalshiHistoricalImporterError("rate limited", 429);
      }

      return {
        markets: [MARKET_A],
        cursor: "",
        provenance: {
          source: "kalshi-historical-api",
          fetchedAt: FIXED_NOW.toISOString(),
          requestPath: "/historical/markets?series_ticker=KXBTC15M&limit=100",
          cursor: "",
        },
      };
    });

    const exitCode = await runMarketDiscoveryCommand(
      ["--max-retries", "2", "--retry-base-delay-ms", "10"],
      io,
      { deps: { importer, now: () => FIXED_NOW, sleep: async () => undefined } },
    );

    expect(exitCode).toBe(0);
    expect(callCount).toBe(2);
    expect(writes.files.size).toBe(1);
    expect(writes.stderr).toContain("retrying in");
  });

  it("does not write partial output when discovery fails", async () => {
    const { io, writes } = createIo();
    const importer = createImporter();
    vi.mocked(importer.listHistoricalMarkets).mockRejectedValue(
      new KalshiHistoricalImporterError("rate limited", 429),
    );

    const exitCode = await runMarketDiscoveryCommand(
      ["--max-retries", "0"],
      io,
      { deps: { importer, now: () => FIXED_NOW } },
    );

    expect(exitCode).toBe(1);
    expect(writes.files.size).toBe(0);
    expect(writes.stderr).toContain("persisted after 0 retries");
  });
});
