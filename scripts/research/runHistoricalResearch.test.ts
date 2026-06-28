import { describe, expect, it, vi } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";

import {
  formatStdoutOutput,
  parseHistoricalResearchInputJson,
  parseInputPathFromArgv,
  runHistoricalResearchCommand,
} from "./runHistoricalResearch";
import {
  HistoricalResearchCommandError,
  parseFormatFromArgv,
} from "./types";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";

function baseBronze(
  contentType: string,
  payload: Record<string, unknown>,
  options: {
    recordId: string;
    ticker: string;
    eventTime: string;
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
      source: DataSource.KALSHI_REST,
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
): RawHistoricalRecord[] {
  const openTime = eventTime;
  const closeTime = new Date(Date.parse(eventTime) + 60_000).toISOString();

  return [
    baseBronze(
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
    baseBronze(
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
      { recordId: `${idPrefix}-candle`, ticker, eventTime: openTime },
    ),
    baseBronze(
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
      { recordId: `${idPrefix}-btc`, ticker, eventTime: closeTime },
    ),
    baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
      {
        floor_strike: 59_990.31,
        expiration_value: "60010.25",
        result: "yes",
        settlement_ts: windowClose,
      },
      { recordId: `${idPrefix}-settlement`, ticker, eventTime },
    ),
  ];
}

function createInputDocument(strategyId: "noop" | "buy-first-ask") {
  return {
    runId: `cli-run-${strategyId}`,
    durationMs: 3_000,
    initialCashCents: 10_000,
    strategyId,
    engineConfig: DEFAULT_ENGINE_CONFIG,
    fillConfig: {
      ...DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
      feeCentsPerContract: 1,
    },
    bronzeRecords: completeMarketRecords(
      `KXBTC15M-CLI-${strategyId.toUpperCase()}`,
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:30:00.000Z",
      strategyId,
    ),
  };
}

function createExportInputDocument(strategyId: "noop" | "buy-first-ask" = "noop") {
  return {
    ...createInputDocument(strategyId),
    exportId: `export-${strategyId}`,
    generatedAt: "2026-06-27T12:00:00.000Z",
    generatedBy: "cli-test",
    label: "historical-export",
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
    expect(parseInputPathFromArgv(["--input", "input.json"])).toBe("input.json");
  });

  it("rejects missing input path", () => {
    expect(() => parseInputPathFromArgv([])).toThrow(HistoricalResearchCommandError);
    expect(() => parseInputPathFromArgv(["--input"])).toThrow(
      "Missing value for --input <path>",
    );
  });
});

describe("parseHistoricalResearchInputJson", () => {
  it("rejects invalid JSON", () => {
    expect(() => parseHistoricalResearchInputJson("{")).toThrow(
      "Input file contains invalid JSON",
    );
  });

  it("rejects empty bronze records", () => {
    const document = createInputDocument("noop");
    document.bronzeRecords = [];

    expect(() => parseHistoricalResearchInputJson(JSON.stringify(document))).toThrow(
      "At least one bronze record is required",
    );
  });

  it("rejects unsupported strategy ids", () => {
    const document = {
      ...createInputDocument("noop"),
      strategyId: "custom-strategy",
    };

    expect(() => parseHistoricalResearchInputJson(JSON.stringify(document))).toThrow();
  });
});

describe("parseFormatFromArgv", () => {
  it("defaults to raw output format", () => {
    expect(parseFormatFromArgv(["--input", "input.json"])).toBe("raw");
  });

  it("parses explicit format flags", () => {
    expect(parseFormatFromArgv(["--input", "input.json", "--format", "export"])).toBe(
      "export",
    );
    expect(
      parseFormatFromArgv(["--format", "export-summary", "--input", "input.json"]),
    ).toBe("export-summary");
  });

  it("rejects invalid format values", () => {
    expect(() =>
      parseFormatFromArgv(["--format", "csv", "--input", "input.json"]),
    ).toThrow('Unsupported --format value "csv"');
  });
});

describe("runHistoricalResearchCommand", () => {
  it("writes deterministic stdout for noop strategy input", () => {
    const json = JSON.stringify(createInputDocument("noop"));
    const firstRun = createIo(json);
    const secondRun = createIo(json);

    expect(runHistoricalResearchCommand(["--input", "noop.json"], firstRun.io)).toBe(0);
    expect(runHistoricalResearchCommand(["--input", "noop.json"], secondRun.io)).toBe(0);
    expect(firstRun.stdout).toEqual(secondRun.stdout);
    expect(firstRun.stdout[0]).toBe(formatStdoutOutput(firstRun.stdout[0]!.trimEnd()));
    expect(firstRun.stderr).toEqual([]);

    const parsed = JSON.parse(firstRun.stdout[0]!.trimEnd());
    expect(parsed.metadata.runId).toBe("cli-run-noop");
    expect(parsed.researchRun).toBeDefined();
  });

  it("writes raw stdout when --format raw is explicit", () => {
    const json = JSON.stringify(createInputDocument("noop"));
    const defaultRun = createIo(json);
    const explicitRun = createIo(json);

    runHistoricalResearchCommand(["--input", "noop.json"], defaultRun.io);
    runHistoricalResearchCommand(
      ["--input", "noop.json", "--format", "raw"],
      explicitRun.io,
    );

    expect(defaultRun.stdout).toEqual(explicitRun.stdout);
    expect(JSON.parse(defaultRun.stdout[0]!)).toHaveProperty("metadata");
  });

  it("writes export JSON when --format export is requested", () => {
    const json = JSON.stringify(createExportInputDocument("noop"));
    const { io, stdout, stderr } = createIo(json);

    expect(
      runHistoricalResearchCommand(
        ["--input", "noop.json", "--format", "export"],
        io,
      ),
    ).toBe(0);

    const parsed = JSON.parse(stdout[0]!);
    expect(parsed.exportType).toBe("research-run");
    expect(parsed.exportId).toBe("export-noop");
    expect(parsed.summary.finalEquityCents).toBeTypeOf("number");
    expect(stderr).toEqual([]);
  });

  it("writes export summary JSON when --format export-summary is requested", () => {
    const json = JSON.stringify(createExportInputDocument("noop"));
    const { io, stdout } = createIo(json);

    expect(
      runHistoricalResearchCommand(
        ["--input", "noop.json", "--format", "export-summary"],
        io,
      ),
    ).toBe(0);

    const parsed = JSON.parse(stdout[0]!);
    expect(parsed.exportId).toBe("export-noop");
    expect(parsed.summary).toBeDefined();
    expect(parsed.tableRows).toBeUndefined();
  });

  it("rejects export modes without exportId", () => {
    const document = createInputDocument("noop");
    const { io, stdout, stderr } = createIo(
      JSON.stringify({
        ...document,
        generatedAt: "2026-06-27T12:00:00.000Z",
      }),
    );

    expect(
      runHistoricalResearchCommand(
        ["--input", "noop.json", "--format", "export"],
        io,
      ),
    ).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr[0]).toContain("exportId is required for export output formats");
  });

  it("rejects export modes without generatedAt", () => {
    const document = createInputDocument("noop");
    const { io, stdout, stderr } = createIo(
      JSON.stringify({
        ...document,
        exportId: "export-no-generated-at",
      }),
    );

    expect(
      runHistoricalResearchCommand(
        ["--input", "noop.json", "--format", "export-summary"],
        io,
      ),
    ).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr[0]).toContain("generatedAt is required for export output formats");
  });

  it("writes deterministic stdout for buy-first-ask strategy input", () => {
    const json = JSON.stringify(createInputDocument("buy-first-ask"));
    const { io, stdout, stderr } = createIo(json);

    expect(runHistoricalResearchCommand(["--input", "buy.json"], io)).toBe(0);
    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain("buy-first-ask");
    expect(stderr).toEqual([]);
  });

  it("writes errors to stderr and returns exit code 1 on failure", () => {
    const { io, stdout, stderr } = createIo("{");

    expect(runHistoricalResearchCommand(["--input", "bad.json"], io)).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual(["Input file contains invalid JSON\n"]);
  });

  it("reports missing input path on stderr", () => {
    const { io, stdout, stderr } = createIo("{}");

    expect(runHistoricalResearchCommand([], io)).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr[0]).toContain("Missing required --input <path>");
  });

  it("reports unreadable input files on stderr", () => {
    const { stdout, stderr } = createIo("{}");
    const io = {
      readFile: () => {
        throw new Error("ENOENT: no such file or directory");
      },
      writeStdout: () => undefined,
      writeStderr: (text: string) => {
        stderr.push(text);
      },
    };

    expect(runHistoricalResearchCommand(["--input", "missing.json"], io)).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr[0]).toContain("ENOENT");
  });

  it("does not write output files", () => {
    const { io, writeFile } = createIo(JSON.stringify(createInputDocument("noop")));

    runHistoricalResearchCommand(["--input", "noop.json"], io);

    expect(writeFile).not.toHaveBeenCalled();
  });

  it("rejects invalid format flags on stderr", () => {
    const { io, stdout, stderr } = createIo(
      JSON.stringify(createExportInputDocument("noop")),
    );

    expect(
      runHistoricalResearchCommand(
        ["--input", "noop.json", "--format", "pretty"],
        io,
      ),
    ).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr[0]).toContain('Unsupported --format value "pretty"');
  });
});

describe("serializeCommandOutput", () => {
  it("returns identical raw output for repeated runs", () => {
    const document = createInputDocument("noop");
    const json = JSON.stringify(document);
    const first = createIo(json);
    const second = createIo(json);

    runHistoricalResearchCommand(["--input", "noop.json"], first.io);
    runHistoricalResearchCommand(["--input", "noop.json"], second.io);

    expect(first.stdout[0]).toBe(second.stdout[0]);
  });
});

describe("research:historical npm script", () => {
  it("is wired with tsx available", async () => {
    const pkg = await import("../../package.json");

    expect(pkg.scripts["research:historical"]).toContain(
      "tsx scripts/research/runHistoricalResearch.ts",
    );
    expect(pkg.devDependencies.tsx).toBeDefined();
  });
});
