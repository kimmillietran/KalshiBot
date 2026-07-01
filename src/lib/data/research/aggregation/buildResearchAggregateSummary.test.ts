import { describe, expect, it } from "vitest";

import {
  buildResearchAggregateSummaries,
  buildResearchAggregateSummary,
  buildResearchAggregateSummariesFromDirectories,
  scanResearchOutputs,
  serializeResearchAggregateSummary,
} from "./buildResearchAggregateSummary";
import {
  computeDurationStatistics,
  computePerformanceStatistics,
} from "./computeResearchAggregateStatistics";
import { buildResearchOutputPath } from "./researchAggregatePaths";
import {
  ResearchAggregateErrorCode,
  type ResearchAggregateIo,
  type ScannedResearchOutput,
} from "./researchAggregateTypes";

const SERIES_TICKER = "KXBTC15M";
const MARKET_A = "KXBTC15M-26APR281930-30";
const MARKET_B = "KXBTC15M-26APR281945-45";
const INPUT_ROOT = "data/research-results";
const GENERATED_AT = "2026-06-27T14:00:00.000Z";

function createBatchOutput(
  marketTicker: string,
  overrides: {
    status?: "completed" | "failed";
    metrics?: {
      totalPnlCents: number;
      totalReturnPct: number;
      maxDrawdownPct: number;
      sharpeRatio: number | null;
      winRatePct: number;
      lossRatePct: number;
      tradeCount: number;
      winningTradeCount?: number;
      losingTradeCount?: number;
    };
    durationMs?: number;
    error?: string;
  } = {},
): string {
  const status = overrides.status ?? "completed";
  const metrics =
    overrides.metrics ?? {
      totalPnlCents: 500,
      totalReturnPct: 0.5,
      maxDrawdownPct: 1.2,
      sharpeRatio: 1.1,
      winRatePct: 60,
      lossRatePct: 40,
      tradeCount: 5,
      winningTradeCount: 3,
      losingTradeCount: 2,
    };

  return JSON.stringify({
    marketTicker,
    status,
    durationMs: overrides.durationMs ?? 1_000,
    ...(status === "completed" ? { metrics } : {}),
    ...(status === "failed" ? { error: overrides.error ?? "Replay failed" } : {}),
  });
}

function createScannedOutput(
  marketTicker: string,
  json: string,
  overrides: Partial<ScannedResearchOutput> = {},
): ScannedResearchOutput {
  return {
    seriesTicker: SERIES_TICKER,
    marketTicker,
    outputPath: buildResearchOutputPath(INPUT_ROOT, SERIES_TICKER, marketTicker),
    outputJson: json,
    ...overrides,
  };
}

function createIo(
  files: Record<string, string>,
  directories: Set<string>,
): ResearchAggregateIo {
  return {
    readdir: (path) => {
      const dirEntries = [...directories]
        .filter((entry) => entry.slice(0, entry.lastIndexOf("/")) === path)
        .map((entry) => entry.slice(entry.lastIndexOf("/") + 1));
      const fileEntries = Object.keys(files)
        .filter((filePath) => filePath.slice(0, filePath.lastIndexOf("/")) === path)
        .map((filePath) => filePath.slice(filePath.lastIndexOf("/") + 1));

      return [...new Set([...dirEntries, ...fileEntries])].sort();
    },
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) {
        throw new Error(`Missing file: ${path}`);
      }
      return content;
    },
    fileExists: (path) => files[path] !== undefined,
    isDirectory: (path) => directories.has(path),
  };
}

describe("computePerformanceStatistics", () => {
  it("aggregates trade-weighted win and loss rates", () => {
    const performance = computePerformanceStatistics([
      {
        marketTicker: MARKET_A,
        outputPath: "a.json",
        status: "completed",
        durationMs: 1_000,
        error: null,
        metrics: {
          totalPnlCents: 300,
          totalReturnPct: 0.3,
          maxDrawdownPct: 2,
          sharpeRatio: 1.5,
          winRatePct: 100,
          lossRatePct: 0,
          tradeCount: 2,
          winningTradeCount: 2,
          losingTradeCount: 0,
        },
      },
      {
        marketTicker: MARKET_B,
        outputPath: "b.json",
        status: "completed",
        durationMs: 2_000,
        error: null,
        metrics: {
          totalPnlCents: -100,
          totalReturnPct: -0.1,
          maxDrawdownPct: 4,
          sharpeRatio: null,
          winRatePct: 0,
          lossRatePct: 100,
          tradeCount: 2,
          winningTradeCount: 0,
          losingTradeCount: 2,
        },
      },
    ]);

    expect(performance.totalTrades).toBe(4);
    expect(performance.totalPnlCents).toBe(200);
    expect(performance.averagePnlCents).toBe(100);
    expect(performance.medianPnlCents).toBe(100);
    expect(performance.winRatePct).toBe(50);
    expect(performance.lossRatePct).toBe(50);
    expect(performance.maxDrawdownPct).toBe(4);
    expect(performance.sharpeRatio).toBe(1.5);
  });
});

describe("buildResearchAggregateSummary", () => {
  it("creates deterministic summaries with stable ordering", () => {
    const first = buildResearchAggregateSummary({
      inputRoot: INPUT_ROOT,
      seriesTicker: SERIES_TICKER,
      generatedAt: GENERATED_AT,
      scanned: [
        createScannedOutput(MARKET_B, createBatchOutput(MARKET_B)),
        createScannedOutput(MARKET_A, createBatchOutput(MARKET_A, {
          metrics: {
            totalPnlCents: 1_000,
            totalReturnPct: 1,
            maxDrawdownPct: 0.5,
            sharpeRatio: 2,
            winRatePct: 100,
            lossRatePct: 0,
            tradeCount: 1,
            winningTradeCount: 1,
            losingTradeCount: 0,
          },
        })),
      ],
    });
    const second = buildResearchAggregateSummary({
      inputRoot: INPUT_ROOT,
      seriesTicker: SERIES_TICKER,
      generatedAt: GENERATED_AT,
      scanned: [
        createScannedOutput(MARKET_A, createBatchOutput(MARKET_A, {
          metrics: {
            totalPnlCents: 1_000,
            totalReturnPct: 1,
            maxDrawdownPct: 0.5,
            sharpeRatio: 2,
            winRatePct: 100,
            lossRatePct: 0,
            tradeCount: 1,
            winningTradeCount: 1,
            losingTradeCount: 0,
          },
        })),
        createScannedOutput(MARKET_B, createBatchOutput(MARKET_B)),
      ],
    });

    expect(first).toEqual(second);
    expect(first.markets.map((market) => market.marketTicker)).toEqual([
      MARKET_A,
      MARKET_B,
    ]);
    expect(first.marketCounts).toEqual({ total: 2, completed: 2, failed: 0 });
    expect(first.performance.totalPnlCents).toBe(1_500);
    expect(computeDurationStatistics(first.markets).totalDurationMs).toBe(2_000);
    expect(serializeResearchAggregateSummary(first)).toBe(
      serializeResearchAggregateSummary(first),
    );
  });

  it("counts failed markets separately", () => {
    const summary = buildResearchAggregateSummary({
      inputRoot: INPUT_ROOT,
      seriesTicker: SERIES_TICKER,
      generatedAt: GENERATED_AT,
      scanned: [
        createScannedOutput(
          MARKET_A,
          createBatchOutput(MARKET_A, { status: "failed", error: "timeout" }),
        ),
        createScannedOutput(MARKET_B, createBatchOutput(MARKET_B)),
      ],
    });

    expect(summary.marketCounts).toEqual({ total: 2, completed: 1, failed: 1 });
    expect(summary.markets[0]?.error).toBe("timeout");
    expect(summary.performance.totalTrades).toBe(5);
  });

  it("rejects duplicate market results", () => {
    expect(() =>
      buildResearchAggregateSummary({
        inputRoot: INPUT_ROOT,
        seriesTicker: SERIES_TICKER,
        generatedAt: GENERATED_AT,
        scanned: [
          createScannedOutput(MARKET_A, createBatchOutput(MARKET_A)),
          createScannedOutput(MARKET_A, createBatchOutput(MARKET_A)),
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: ResearchAggregateErrorCode.DUPLICATE_MARKET_RESULT,
      }),
    );
  });

  it("rejects invalid schemas and empty datasets", () => {
    expect(() =>
      buildResearchAggregateSummary({
        inputRoot: INPUT_ROOT,
        seriesTicker: SERIES_TICKER,
        generatedAt: GENERATED_AT,
        scanned: [
          createScannedOutput(MARKET_A, "{}"),
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: ResearchAggregateErrorCode.INVALID_OUTPUT_SCHEMA,
      }),
    );

    expect(() =>
      buildResearchAggregateSummary({
        inputRoot: INPUT_ROOT,
        seriesTicker: SERIES_TICKER,
        generatedAt: GENERATED_AT,
        scanned: [],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: ResearchAggregateErrorCode.EMPTY_DATASET,
      }),
    );
  });
});

describe("scanResearchOutputs", () => {
  it("scans nested research-output.json files", () => {
    const outputPathA = buildResearchOutputPath(INPUT_ROOT, SERIES_TICKER, MARKET_A);
    const outputPathB = buildResearchOutputPath(INPUT_ROOT, SERIES_TICKER, MARKET_B);
    const directories = new Set([
      INPUT_ROOT,
      `${INPUT_ROOT}/${SERIES_TICKER}`,
      `${INPUT_ROOT}/${SERIES_TICKER}/${MARKET_A}`,
      `${INPUT_ROOT}/${SERIES_TICKER}/${MARKET_B}`,
    ]);

    const scanned = scanResearchOutputs(
      INPUT_ROOT,
      createIo(
        {
          [outputPathA]: createBatchOutput(MARKET_A),
          [outputPathB]: createBatchOutput(MARKET_B),
        },
        directories,
      ),
    );

    expect(scanned).toHaveLength(2);
    expect(scanned.map((entry) => entry.marketTicker)).toEqual([MARKET_A, MARKET_B]);
  });

  it("reports missing input directories", () => {
    expect(() =>
      scanResearchOutputs(INPUT_ROOT, createIo({}, new Set())),
    ).toThrowError(
      expect.objectContaining({
        code: ResearchAggregateErrorCode.MISSING_INPUT_DIRECTORY,
      }),
    );
  });
});

describe("buildResearchAggregateSummariesFromDirectories", () => {
  it("builds summaries from scanned directories", () => {
    const outputPath = buildResearchOutputPath(INPUT_ROOT, SERIES_TICKER, MARKET_A);
    const directories = new Set([
      INPUT_ROOT,
      `${INPUT_ROOT}/${SERIES_TICKER}`,
      `${INPUT_ROOT}/${SERIES_TICKER}/${MARKET_A}`,
    ]);

    const summaries = buildResearchAggregateSummariesFromDirectories(
      INPUT_ROOT,
      createIo({ [outputPath]: createBatchOutput(MARKET_A) }, directories),
      { generatedAt: GENERATED_AT },
    );

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.marketCounts.total).toBe(1);
  });
});

describe("buildResearchAggregateSummaries", () => {
  it("groups outputs by series ticker", () => {
    const summaries = buildResearchAggregateSummaries(
      INPUT_ROOT,
      [
        createScannedOutput(MARKET_A, createBatchOutput(MARKET_A)),
        {
          seriesTicker: "OTHER",
          marketTicker: "OTHER-MARKET",
          outputPath: "data/research-results/OTHER/OTHER-MARKET/research-output.json",
          outputJson: createBatchOutput("OTHER-MARKET"),
        },
      ],
      { generatedAt: GENERATED_AT },
    );

    expect(summaries.map((summary) => summary.seriesTicker)).toEqual([
      SERIES_TICKER,
      "OTHER",
    ]);
  });
});
