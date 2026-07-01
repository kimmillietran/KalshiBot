import { describe, expect, it, vi } from "vitest";

import type { HistoricalImporter } from "@/lib/data/importers/kalshi/HistoricalImporter";
import type { HistoricalMarketRecord } from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";
import type { FetchLike } from "@/lib/data/importers/kalshi";

import { runMarketDiscoveryCommand } from "./runMarketDiscovery";
import {
  MarketDiscoveryCommandError,
  parseOutputPathFromArgv,
  parseSeriesFromArgv,
} from "./types";

const FIXED_NOW = new Date("2026-06-27T12:00:00.000Z");

const SAMPLE_MARKET: HistoricalMarketRecord = {
  ticker: "KXBTC15M-26JUN270115-15",
  eventTicker: "KXBTC15M-26JUN270115",
  status: "finalized",
  result: "yes",
  openTime: "2026-06-27T01:00:00Z",
  closeTime: "2026-06-27T01:15:00Z",
  settlementTs: "2026-06-27T01:20:00Z",
  settlementValueDollars: "1.0000",
  expirationValue: "60010.25",
  floorStrike: 59_990.31,
};

function createImporter(): HistoricalImporter {
  return {
    listHistoricalMarkets: vi.fn(async () => ({
      markets: [SAMPLE_MARKET],
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

  it("parses --series and --output flags", () => {
    expect(parseSeriesFromArgv(["--series", "KXBTC15M"])).toBe("KXBTC15M");
    expect(parseOutputPathFromArgv(["--output", "discovery-result.json"])).toBe(
      "discovery-result.json",
    );
  });

  it("throws when --output is missing", () => {
    expect(() => parseOutputPathFromArgv(["--series", "KXBTC15M"])).toThrow(
      MarketDiscoveryCommandError,
    );
  });
});

describe("runMarketDiscoveryCommand", () => {
  it("writes deterministic discovery-result.json output", async () => {
    const { io, writes } = createIo();

    const exitCode = await runMarketDiscoveryCommand(
      ["--series", "KXBTC15M", "--output", "discovery-result.json"],
      io,
      { deps: { importer: createImporter(), now: () => FIXED_NOW } },
    );

    expect(exitCode).toBe(0);
    expect(writes.files.has("discovery-result.json")).toBe(true);
    const serialized = writes.files.get("discovery-result.json")!;
    expect(serialized).toContain("KXBTC15M-26JUN270115-15");
    expect(serialized).toContain('"valid":true');
    expect(writes.stdout).toContain('"marketCount":1');
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
});
