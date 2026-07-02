import { describe, expect, it, vi } from "vitest";

import { runAuditBidAskFidelityCommand } from "./auditBidAskFidelity";
import { AuditBidAskFidelityCommandError } from "./auditBidAskFidelityTypes";
import { parseInputDirFromArgv, parseOutputPathFromArgv } from "./auditBidAskFidelityTypes";

describe("auditBidAskFidelity CLI args", () => {
  it("defaults input and output paths", () => {
    expect(parseInputDirFromArgv([])).toBe("data/imports");
    expect(parseOutputPathFromArgv([])).toBe("data/audits/bid-ask-fidelity.json");
  });

  it("parses explicit paths", () => {
    expect(parseInputDirFromArgv(["--input-dir", "custom/imports"])).toBe(
      "custom/imports",
    );
    expect(parseOutputPathFromArgv(["--output", "custom/report.json"])).toBe(
      "custom/report.json",
    );
  });

  it("throws when flags are missing values", () => {
    expect(() => parseInputDirFromArgv(["--input-dir"])).toThrow(
      AuditBidAskFidelityCommandError,
    );
    expect(() => parseOutputPathFromArgv(["--output"])).toThrow(
      AuditBidAskFidelityCommandError,
    );
  });
});

describe("runAuditBidAskFidelityCommand", () => {
  it("writes a deterministic audit report and returns exit code 0", () => {
    const importsRoot = "data/imports";
    const fixturesRoot = "data/fixtures";
    const seriesTicker = "KXBTC15M";
    const marketTicker = "KXBTC15M-MARKET-A";
    const fixturePath = `${fixturesRoot}/${seriesTicker}/${marketTicker}/fixture.json`;
    const outputPath = "data/audits/bid-ask-fidelity.json";
    const directories = new Set([
      importsRoot,
      `${importsRoot}/${seriesTicker}`,
      `${importsRoot}/${seriesTicker}/${marketTicker}`,
      fixturesRoot,
      `${fixturesRoot}/${seriesTicker}`,
      `${fixturesRoot}/${seriesTicker}/${marketTicker}`,
    ]);
    const files: Record<string, string> = {
      [fixturePath]: JSON.stringify({
        runId: "fixture-run",
        durationMs: 1_000,
        initialCashCents: 10_000,
        strategyId: "noop",
        engineConfig: {
          enabled: true,
          minEdgePercent: 1,
          minLiquidityQuality: "Fair",
          maxSpreadPercent: 15,
          minimumTimeRemaining: 60,
          minimumCandles: 1,
        },
        fillConfig: {
          feeCentsPerContract: 1,
          allowPartialFills: false,
          priceSource: "engine-input-pricing",
        },
        bronzeRecords: [
          {
            recordId: "candle-1",
            ticker: marketTicker,
            contentType: "kalshi.historical.candlestick",
            eventTime: "2026-06-26T23:15:00.000Z",
            collectionTime: "2026-06-27T01:00:00.000Z",
            observedAt: "2026-06-27T01:00:05.000Z",
            payload: {
              yes_bid_cents: 48,
              yes_ask_cents: 52,
            },
            provenance: {
              source: "kalshi-candles",
              collectionTime: "2026-06-27T01:00:00.000Z",
              observedAt: "2026-06-27T01:00:05.000Z",
              fetchId: "fetch-1",
            },
          },
        ],
      }),
    };
    const writes = new Map<string, string>();

    const exitCode = runAuditBidAskFidelityCommand(
      ["--input-dir", importsRoot, "--output", outputPath],
      {
        readFile: (path) => {
          const content = files[path];
          if (content === undefined) {
            throw new Error(`Missing file: ${path}`);
          }
          return content;
        },
        writeStdout: vi.fn(),
        writeStderr: vi.fn(),
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: vi.fn(),
        readdir: (path) =>
          [...directories]
            .filter((entry) => entry.slice(0, entry.lastIndexOf("/")) === path)
            .map((entry) => entry.slice(entry.lastIndexOf("/") + 1))
            .sort((left, right) => left.localeCompare(right)),
        fileExists: (path) => files[path] !== undefined || writes.has(path),
        isDirectory: (path) => directories.has(path),
      },
      { generatedAt: "2026-06-27T12:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(writes.get(outputPath)).toContain('"bidLessThanAskCount":1');
    expect(writes.get(outputPath)).toBe(writes.get(outputPath));
  });
});
