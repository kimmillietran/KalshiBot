import { describe, expect, it, vi } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import {
  buildHistoricalBronzeImportConfig,
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportOutputFormat,
} from "@/lib/data/importJobs/config";
import type { BuildHistoricalBronzeImportConfigInput } from "@/lib/data/importJobs/config";
import {
  runConfiguredHistoricalBronzeImport,
} from "@/lib/data/importJobs";

import {
  formatStdoutOutput,
  parseInputPathFromArgv,
  runHistoricalImportCommand,
} from "./runHistoricalImport";
import {
  HistoricalImportCommandError,
  parseDryRunFromArgv,
  parseHistoricalImportInputJson,
  serializeHistoricalBronzeImportPlan,
} from "./types";
import type { HistoricalImportCommandDeps, HistoricalImportFetchLike } from "./types";

async function runCommand(
  argv: readonly string[],
  io: ReturnType<typeof createIo>["io"],
  options?: HistoricalImportCommandDeps | {
    deps?: HistoricalImportCommandDeps;
    fetchImpl?: HistoricalImportFetchLike;
  },
): Promise<number> {
  const result = runHistoricalImportCommand(argv, io, options);
  return result instanceof Promise ? result : result;
}

const START_TIME = "2026-06-26T23:15:00.000Z";
const END_TIME = "2026-06-26T23:30:00.000Z";
const WINDOW_CLOSE = "2026-06-26T23:30:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const MARKET_TICKER = "KXBTC15M-26JUN262315-15";

const SAMPLE_MARKET_WIRE = {
  ticker: MARKET_TICKER,
  event_ticker: "KXBTC15M-26JUN262315",
  status: "finalized",
  result: "yes",
  close_time: "2026-06-27T01:15:00.000Z",
  settlement_ts: "2026-06-27T01:20:00.000Z",
  settlement_value_dollars: "1.0000",
  expiration_value: "60010.25",
  floor_strike: 59_990.31,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createBootstrapFetchImpl(): HistoricalImportFetchLike {
  return vi.fn(async (url: string) => {
    if (url.includes("/historical/markets?")) {
      return jsonResponse({
        markets: [SAMPLE_MARKET_WIRE],
        cursor: "",
      });
    }

    if (url.includes("/candlesticks")) {
      return jsonResponse({
        ticker: MARKET_TICKER,
        candlesticks: [
          {
            end_period_ts: Math.floor(Date.parse(START_TIME) / 1000) + 60,
            volume: "12.00",
            open_interest: "45.00",
            price: { close: "0.5200" },
          },
        ],
      });
    }

    if (url.includes(`/historical/markets/${MARKET_TICKER}`)) {
      return jsonResponse({ market: SAMPLE_MARKET_WIRE });
    }

    if (url.includes("/api/v3/klines")) {
      const openTimeMs = Date.parse(START_TIME);
      const closeTimeMs = Date.parse(START_TIME) + 59_999;
      return jsonResponse([
        [
          openTimeMs,
          "59980.50",
          "60010.25",
          "59960.00",
          "59995.75",
          "12.5",
          closeTimeMs,
        ],
      ]);
    }

    if (url.includes("/products/") && url.includes("/candles")) {
      const openTimeSec = Math.floor(Date.parse(START_TIME) / 1000);
      return jsonResponse([
        [openTimeSec, 59_960, 60_010.25, 59_980.5, 59_995.75, 12.5],
      ]);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

function validInputDocument(
  overrides: Partial<BuildHistoricalBronzeImportConfigInput> = {},
): BuildHistoricalBronzeImportConfigInput {
  return {
    jobId: "import-job-6.16a",
    marketTicker: MARKET_TICKER,
    startTime: START_TIME,
    endTime: END_TIME,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    kalshi: {
      marketSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
      candleSource: HistoricalBronzeImportKalshiSource.KALSHI_CANDLES,
      settlementSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
    },
    btc: {
      provider: HistoricalBronzeImportBtcProvider.BINANCE_SPOT,
      symbol: "BTCUSDT",
      interval: HistoricalBronzeImportBtcInterval.ONE_MINUTE,
    },
    output: {
      format: HistoricalBronzeImportOutputFormat.JSON,
      includeValidationReport: true,
      includeFixture: false,
    },
    metadata: {
      label: "historical-import-cli",
    },
    ...overrides,
  };
}

function baseBronze(
  contentType: string,
  payload: Record<string, unknown>,
  options: {
    recordId: string;
    ticker: string;
    eventTime: string;
    source?: (typeof DataSource)[keyof typeof DataSource];
  },
): RawHistoricalRecord {
  return {
    recordId: options.recordId,
    ticker: options.ticker,
    contentType,
    eventTime: options.eventTime,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    payload,
    provenance: {
      source: options.source ?? DataSource.KALSHI_REST,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      fetchId: `fetch-${options.recordId}`,
    },
  };
}

function completeMarketRecords(
  ticker: string,
  eventTime: string,
  windowClose: string,
  idPrefix: string,
): {
  market: RawHistoricalRecord;
  candle: RawHistoricalRecord;
  btc: RawHistoricalRecord;
  settlement: RawHistoricalRecord;
} {
  const openTime = eventTime;
  const closeTime = new Date(Date.parse(eventTime) + 60_000).toISOString();

  return {
    market: baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.MARKET,
      {
        open_time: eventTime,
        close_time: windowClose,
        floor_strike: 59_990.31,
        event_ticker: `${ticker.split("-")[0]}-EVENT`,
        status: "closed",
      },
      { recordId: `${idPrefix}-market`, ticker, eventTime },
    ),
    candle: baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
      {
        open_time: openTime,
        close_time: closeTime,
        yes_bid_cents: 48,
        yes_ask_cents: 52,
        no_bid_cents: 47,
        no_ask_cents: 51,
        volume_contracts: 120,
      },
      {
        recordId: `${idPrefix}-candle`,
        ticker,
        eventTime: closeTime,
        source: DataSource.KALSHI_CANDLES,
      },
    ),
    btc: baseBronze(
      "binance.historical.kline",
      {
        open_time: openTime,
        close_time: closeTime,
        open_usd: 59_980.5,
        high_usd: 60_010.25,
        low_usd: 59_960.0,
        close_usd: 59_995.75,
        volume_btc: 12.5,
      },
      {
        recordId: `${idPrefix}-btc`,
        ticker,
        eventTime: closeTime,
        source: DataSource.BINANCE_SPOT,
      },
    ),
    settlement: baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
      {
        floor_strike: 59_990.31,
        expiration_value: "60010.25",
        result: "yes",
        settlement_ts: windowClose,
      },
      { recordId: `${idPrefix}-settlement`, ticker, eventTime },
    ),
  };
}

function createCommandDeps(): HistoricalImportCommandDeps {
  const records = completeMarketRecords(
    MARKET_TICKER,
    START_TIME,
    WINDOW_CLOSE,
    "cli-exec",
  );

  return {
    kalshiProvider: {
      importKalshiMarketRecords: vi.fn(() => [records.market]),
      importKalshiCandleRecords: vi.fn(() => [records.candle]),
      importKalshiSettlementRecords: vi.fn(() => [records.settlement]),
    },
    btcProvider: {
      importBtcKlineRecords: vi.fn(() => [records.btc]),
    },
  };
}

function createIo(readJson: string) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const writeFile = vi.fn();

  return {
    io: {
      readFile: () => readJson,
      writeStdout: (text: string) => {
        stdout.push(text);
      },
      writeStderr: (text: string) => {
        stderr.push(text);
      },
      writeFile,
    },
    stdout,
    stderr,
    writeFile,
  };
}

describe("parseInputPathFromArgv", () => {
  it("parses --input path", () => {
    expect(parseInputPathFromArgv(["--input", "config.json"])).toBe("config.json");
  });

  it("rejects missing input path", () => {
    expect(() => parseInputPathFromArgv([])).toThrow(HistoricalImportCommandError);
    expect(() => parseInputPathFromArgv(["--input"])).toThrow(
      "Missing value for --input <path>",
    );
  });
});

describe("parseDryRunFromArgv", () => {
  it("detects --dry-run", () => {
    expect(parseDryRunFromArgv(["--input", "config.json", "--dry-run"])).toBe(true);
    expect(parseDryRunFromArgv(["--input", "config.json"])).toBe(false);
  });
});

describe("parseHistoricalImportInputJson", () => {
  it("accepts valid config JSON", () => {
    const config = parseHistoricalImportInputJson(
      JSON.stringify(validInputDocument()),
    );

    expect(config.jobId).toBe("import-job-6.16a");
    expect(config.marketTicker).toBe(MARKET_TICKER);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseHistoricalImportInputJson("{")).toThrow(
      "Input file contains invalid JSON",
    );
  });

  it("rejects invalid config", () => {
    expect(() =>
      parseHistoricalImportInputJson(
        JSON.stringify(validInputDocument({ jobId: "   " })),
      ),
    ).toThrow("jobId is required");
  });
});

describe("runHistoricalImportCommand dry-run", () => {
  it("writes deterministic stdout for valid config with --dry-run", () => {
    const json = JSON.stringify(validInputDocument());
    const firstRun = createIo(json);
    const secondRun = createIo(json);

    expect(
      runHistoricalImportCommand(["--input", "config.json", "--dry-run"], firstRun.io),
    ).toBe(0);
    expect(
      runHistoricalImportCommand(["--input", "config.json", "--dry-run"], secondRun.io),
    ).toBe(0);
    expect(firstRun.stdout).toEqual(secondRun.stdout);
    expect(firstRun.stdout[0]).toBe(formatStdoutOutput(firstRun.stdout[0]!.trimEnd()));
    expect(firstRun.stderr).toEqual([]);
  });

  it("writes JSON.parse-able dry-run plan stdout", () => {
    const { io, stdout } = createIo(JSON.stringify(validInputDocument()));

    expect(
      runHistoricalImportCommand(["--input", "config.json", "--dry-run"], io),
    ).toBe(0);

    const parsed = JSON.parse(stdout[0]!.trimEnd());
    expect(parsed.jobId).toBe("import-job-6.16a");
    expect(parsed.marketTicker).toBe(MARKET_TICKER);
    expect(parsed.startTime).toBe(START_TIME);
    expect(parsed.endTime).toBe(END_TIME);
    expect(parsed.providerSelections.kalshi.marketSource).toBe("kalshi-rest");
    expect(parsed.providerSelections.btc.provider).toBe("binance-spot");
    expect(parsed.outputSelections.format).toBe("json");
    expect(typeof parsed.serializedConfig).toBe("string");
    expect(parsed.dryRun).toBe(true);
  });

  it("does not write output files in dry-run mode", () => {
    const { io, writeFile } = createIo(JSON.stringify(validInputDocument()));

    runHistoricalImportCommand(["--input", "config.json", "--dry-run"], io);

    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe("runHistoricalImportCommand execute mode", () => {
  it("runs the configured import harness and prints job result JSON", async () => {
    const deps = createCommandDeps();
    const { io, stdout } = createIo(JSON.stringify(validInputDocument()));

    expect(await runCommand(["--input", "config.json"], io, deps)).toBe(0);

    const parsed = JSON.parse(stdout[0]!.trimEnd());
    expect(parsed.jobId).toBe("import-job-6.16a");
    expect(parsed.bronzeRecords).toHaveLength(4);
    expect(parsed.validationResult.valid).toBe(true);
    expect(parsed.metadata.bronzeRecordCount).toBe(4);
    expect(parsed.metadata.valid).toBe(true);
  });

  it("calls each injected provider once", async () => {
    const deps = createCommandDeps();
    const { io } = createIo(JSON.stringify(validInputDocument()));

    await runCommand(["--input", "config.json"], io, deps);

    const expectedProviderInput = {
      marketTicker: MARKET_TICKER,
      startTime: START_TIME,
      endTime: END_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
    };

    expect(deps.kalshiProvider.importKalshiMarketRecords).toHaveBeenCalledOnce();
    expect(deps.kalshiProvider.importKalshiMarketRecords).toHaveBeenCalledWith(
      expectedProviderInput,
    );
    expect(deps.kalshiProvider.importKalshiCandleRecords).toHaveBeenCalledOnce();
    expect(deps.kalshiProvider.importKalshiSettlementRecords).toHaveBeenCalledOnce();
    expect(deps.btcProvider.importBtcKlineRecords).toHaveBeenCalledOnce();
    expect(deps.btcProvider.importBtcKlineRecords).toHaveBeenCalledWith(
      expectedProviderInput,
    );
  });

  it("writes deterministic execute stdout for repeated runs", async () => {
    const json = JSON.stringify(validInputDocument());
    const firstRun = createIo(json);
    const secondRun = createIo(json);
    const deps = createCommandDeps();

    await runCommand(["--input", "config.json"], firstRun.io, deps);
    await runCommand(["--input", "config.json"], secondRun.io, deps);

    expect(firstRun.stdout).toEqual(secondRun.stdout);
  });

  it("returns deeply frozen immutable results from the harness", () => {
    const deps = createCommandDeps();
    const config = buildHistoricalBronzeImportConfig(validInputDocument());
    const result = runConfiguredHistoricalBronzeImport({
      config,
      kalshiProvider: deps.kalshiProvider,
      btcProvider: deps.btcProvider,
    });

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.bronzeRecords)).toBe(true);
    expect(Object.isFrozen(result.validationResult)).toBe(true);
    expect(Object.isFrozen(result.metadata)).toBe(true);
  });

  it("propagates provider errors to stderr", async () => {
    const deps = createCommandDeps();
    const providerError = new Error("provider import failed");
    (
      deps.kalshiProvider.importKalshiMarketRecords as ReturnType<typeof vi.fn>
    ).mockImplementation(() => {
      throw providerError;
    });
    const { io, stdout, stderr } = createIo(JSON.stringify(validInputDocument()));

    expect(await runCommand(["--input", "config.json"], io, deps)).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual(["provider import failed\n"]);
  });

  it("constructs providers and executes import when deps are omitted", async () => {
    const fetchImpl = createBootstrapFetchImpl();
    const { io, stdout } = createIo(JSON.stringify(validInputDocument()));

    expect(
      await runCommand(["--input", "config.json"], io, { fetchImpl }),
    ).toBe(0);

    const parsed = JSON.parse(stdout[0]!.trimEnd());
    expect(parsed.jobId).toBe("import-job-6.16a");
    expect(parsed.bronzeRecords.length).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("constructs Coinbase providers and executes import when deps are omitted", async () => {
    const fetchImpl = createBootstrapFetchImpl();
    const { io, stdout } = createIo(
      JSON.stringify(
        validInputDocument({
          btc: {
            provider: HistoricalBronzeImportBtcProvider.COINBASE_SPOT,
            symbol: "BTC-USD",
            interval: HistoricalBronzeImportBtcInterval.ONE_MINUTE,
          },
        }),
      ),
    );

    expect(
      await runCommand(["--input", "config.json"], io, { fetchImpl }),
    ).toBe(0);

    const parsed = JSON.parse(stdout[0]!.trimEnd());
    expect(parsed.jobId).toBe("import-job-6.16a");
    expect(parsed.bronzeRecords.length).toBeGreaterThan(0);
    expect(
      (fetchImpl as ReturnType<typeof vi.fn>).mock.calls.some(([url]) =>
        String(url).includes("/products/") && String(url).includes("/candles"),
      ),
    ).toBe(true);
  });

  it("writes deterministic bootstrap execute stdout from mocked fetch responses", async () => {
    const json = JSON.stringify(validInputDocument());
    const firstRun = createIo(json);
    const secondRun = createIo(json);
    const fetchImpl = createBootstrapFetchImpl();

    await runCommand(["--input", "config.json"], firstRun.io, { fetchImpl });
    await runCommand(["--input", "config.json"], secondRun.io, { fetchImpl });

    expect(firstRun.stdout).toEqual(secondRun.stdout);
    expect(() => JSON.parse(firstRun.stdout[0]!.trimEnd())).not.toThrow();
  });

  it("uses injected fetchImpl without calling global fetch", async () => {
    const fetchImpl = createBootstrapFetchImpl();
    const globalFetchSpy = vi.spyOn(globalThis, "fetch");
    const { io } = createIo(JSON.stringify(validInputDocument()));

    await runCommand(["--input", "config.json"], io, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalled();
    expect(globalFetchSpy).not.toHaveBeenCalled();
    globalFetchSpy.mockRestore();
  });

  it("propagates bootstrap errors to stderr", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ code: "bad_request", message: "bootstrap fetch failed" }, 400),
    );
    const { io, stdout, stderr } = createIo(JSON.stringify(validInputDocument()));

    expect(await runCommand(["--input", "config.json"], io, { fetchImpl })).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr[0]).toMatch(/failed|Kalshi historical API error/i);
  });

  it("does not write output files in execute mode", async () => {
    const deps = createCommandDeps();
    const { io, writeFile } = createIo(JSON.stringify(validInputDocument()));

    await runCommand(["--input", "config.json"], io, deps);

    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe("runHistoricalImportCommand failures", () => {
  it("writes errors to stderr and returns exit code 1 on failure", () => {
    const { io, stdout, stderr } = createIo("{");

    expect(runHistoricalImportCommand(["--input", "bad.json", "--dry-run"], io)).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual(["Input file contains invalid JSON\n"]);
  });

  it("reports missing input path on stderr", () => {
    const { io, stdout, stderr } = createIo("{}");

    expect(runHistoricalImportCommand([], io)).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr[0]).toContain("Missing required --input <path>");
  });

  it("reports invalid config on stderr", () => {
    const { io, stdout, stderr } = createIo(
      JSON.stringify(validInputDocument({ startTime: END_TIME, endTime: START_TIME })),
    );

    expect(runHistoricalImportCommand(["--input", "config.json", "--dry-run"], io)).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr[0]).toContain("startTime must be before endTime");
  });
});

describe("serializeHistoricalBronzeImportPlan", () => {
  it("returns identical dry-run output for repeated runs", () => {
    const json = JSON.stringify(validInputDocument());
    const first = createIo(json);
    const second = createIo(json);

    runHistoricalImportCommand(["--input", "config.json", "--dry-run"], first.io);
    runHistoricalImportCommand(["--input", "config.json", "--dry-run"], second.io);

    expect(first.stdout[0]).toBe(second.stdout[0]);
    expect(first.stdout[0]).toBe(
      formatStdoutOutput(
        serializeHistoricalBronzeImportPlan(
          JSON.parse(first.stdout[0]!.trimEnd()),
        ),
      ),
    );
  });
});

describe("import:historical npm script", () => {
  it("is wired with tsx available", async () => {
    const pkg = await import("../../package.json");

    expect(pkg.scripts["import:historical"]).toContain(
      "tsx scripts/import/runHistoricalImport.ts",
    );
    expect(pkg.devDependencies.tsx).toBeDefined();
  });
});
