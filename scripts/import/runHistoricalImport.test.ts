import { describe, expect, it, vi } from "vitest";

import {
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportOutputFormat,
} from "@/lib/data/importJobs/config";
import type { BuildHistoricalBronzeImportConfigInput } from "@/lib/data/importJobs/config";

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

const START_TIME = "2026-06-26T23:15:00.000Z";
const END_TIME = "2026-06-26T23:30:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";

function validInputDocument(
  overrides: Partial<BuildHistoricalBronzeImportConfigInput> = {},
): BuildHistoricalBronzeImportConfigInput {
  return {
    jobId: "import-job-6.16a",
    marketTicker: "KXBTC15M-26JUN262315-15",
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
    expect(config.marketTicker).toBe("KXBTC15M-26JUN262315-15");
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

describe("runHistoricalImportCommand", () => {
  it("writes deterministic stdout for valid config", () => {
    const json = JSON.stringify(validInputDocument());
    const firstRun = createIo(json);
    const secondRun = createIo(json);

    expect(runHistoricalImportCommand(["--input", "config.json"], firstRun.io)).toBe(0);
    expect(runHistoricalImportCommand(["--input", "config.json"], secondRun.io)).toBe(0);
    expect(firstRun.stdout).toEqual(secondRun.stdout);
    expect(firstRun.stdout[0]).toBe(formatStdoutOutput(firstRun.stdout[0]!.trimEnd()));
    expect(firstRun.stderr).toEqual([]);
  });

  it("writes JSON.parse-able stdout with plan fields", () => {
    const { io, stdout } = createIo(JSON.stringify(validInputDocument()));

    expect(runHistoricalImportCommand(["--input", "config.json"], io)).toBe(0);

    const parsed = JSON.parse(stdout[0]!.trimEnd());
    expect(parsed.jobId).toBe("import-job-6.16a");
    expect(parsed.marketTicker).toBe("KXBTC15M-26JUN262315-15");
    expect(parsed.startTime).toBe(START_TIME);
    expect(parsed.endTime).toBe(END_TIME);
    expect(parsed.providerSelections.kalshi.marketSource).toBe("kalshi-rest");
    expect(parsed.providerSelections.btc.provider).toBe("binance-spot");
    expect(parsed.outputSelections.format).toBe("json");
    expect(parsed.outputSelections.includeValidationReport).toBe(true);
    expect(typeof parsed.serializedConfig).toBe("string");
    expect(JSON.parse(parsed.serializedConfig).jobId).toBe("import-job-6.16a");
    expect(parsed.dryRun).toBe(true);
  });

  it("accepts --dry-run", () => {
    const { io, stdout } = createIo(JSON.stringify(validInputDocument()));

    expect(
      runHistoricalImportCommand(["--input", "config.json", "--dry-run"], io),
    ).toBe(0);

    const parsed = JSON.parse(stdout[0]!.trimEnd());
    expect(parsed.dryRun).toBe(true);
  });

  it("writes errors to stderr and returns exit code 1 on failure", () => {
    const { io, stdout, stderr } = createIo("{");

    expect(runHistoricalImportCommand(["--input", "bad.json"], io)).toBe(1);
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

    expect(runHistoricalImportCommand(["--input", "config.json"], io)).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr[0]).toContain("startTime must be before endTime");
  });

  it("does not write output files", () => {
    const { io, writeFile } = createIo(JSON.stringify(validInputDocument()));

    runHistoricalImportCommand(["--input", "config.json"], io);

    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe("serializeHistoricalBronzeImportPlan", () => {
  it("returns identical output for repeated runs", () => {
    const json = JSON.stringify(validInputDocument());
    const first = createIo(json);
    const second = createIo(json);

    runHistoricalImportCommand(["--input", "config.json"], first.io);
    runHistoricalImportCommand(["--input", "config.json"], second.io);

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
