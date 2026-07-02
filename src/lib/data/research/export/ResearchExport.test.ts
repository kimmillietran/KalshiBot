import { describe, expect, it } from "vitest";

import { BacktestLedger } from "@/lib/data/backtesting/BacktestLedger";
import type { HistoricalBacktestResult } from "@/lib/data/backtesting/historicalBacktestTypes";
import type { BacktestMetricsSummary } from "@/lib/data/backtesting/metricsTypes";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";

import { compareResearchExperiments } from "../comparison/ResearchComparison";
import type { ResearchExperimentResultWithMetrics } from "../comparison/comparisonTypes";
import {
  ResearchExportError,
  ResearchExportErrorCode,
  ResearchExportType,
} from "./researchExportTypes";
import type { HistoricalResearchRun } from "./researchExportTypes";
import {
  buildResearchComparisonExport,
  buildResearchRunExport,
  serializeResearchExportDocument,
} from "./ResearchExport";

const GENERATED_AT = "2026-06-27T12:00:00.000Z";
const GENERATED = {
  generatedAt: GENERATED_AT,
  generatedBy: "test-suite",
  label: "export-test",
};

function metrics(
  overrides: Partial<BacktestMetricsSummary> = {},
): BacktestMetricsSummary {
  return {
    totalReturnPct: 10,
    totalPnlCents: 10_000,
    maxDrawdownPct: 5,
    maxDrawdownCents: 5_000,
    winRatePct: 55,
    lossRatePct: 45,
    averageWinCents: 1_000,
    averageLossCents: -800,
    profitFactor: 1.5,
    expectancyCents: 250,
    tradeCount: 20,
    winningTradeCount: 11,
    losingTradeCount: 9,
    breakevenTradeCount: 0,
    startEquityCents: 100_000,
    endEquityCents: 110_000,
    peakEquityCents: 115_000,
    troughEquityCents: 95_000,
    annualizedReturnPct: 12,
    sharpeRatio: 1.2,
    returnVolatilityPct: 8,
    totalFeesCents: 0,
    totalSpreadCostCents: 0,
    grossPnlCents: 10_000,
    netPnlCents: 10_000,
    feesAsPercentOfGrossPnl: null,
    ...overrides,
  };
}

function backtestResult(
  overrides: Partial<BacktestMetricsSummary> = {},
): HistoricalBacktestResult {
  const ledger = BacktestLedger.create(100_000);

  return {
    replayResult: { results: [] },
    strategyRun: {
      strategyId: "baseline-strategy",
      ledger,
      steps: [],
    },
    ledger,
    metrics: metrics(overrides),
    metadata: {
      strategyId: "baseline-strategy",
      initialCashCents: 100_000,
      completedAtStep: 4,
      snapshotCount: 5,
      engineConfig: DEFAULT_ENGINE_CONFIG,
      fillConfig: DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
    },
  };
}

function researchRun(
  runId: string,
  metricOverrides: Partial<BacktestMetricsSummary> = {},
): HistoricalResearchRun {
  return {
    datasetMetadata: {
      datasetId: `dataset-${runId}`,
      contractVersion: DATA_CONTRACT_VERSION,
      snapshotCount: 5,
      marketTickers: ["KXBTC15M-TEST"],
    },
    backtestResult: backtestResult(metricOverrides),
    durationMs: 1_250,
    config: {
      runId,
      initialCashCents: 100_000,
    },
  };
}

function experiment(
  experimentId: string,
  metricOverrides: Partial<BacktestMetricsSummary> = {},
): ResearchExperimentResultWithMetrics {
  return {
    experimentId,
    sweepId: "export-sweep",
    parameters: { strategy: experimentId },
    status: "completed",
    metrics: metrics(metricOverrides),
  };
}

describe("buildResearchRunExport", () => {
  it("builds a single research run export document", () => {
    const run = researchRun("run-a");
    const document = buildResearchRunExport({
      exportId: "export-run-a",
      generated: GENERATED,
      run,
    });

    expect(document.exportType).toBe(ResearchExportType.RESEARCH_RUN);
    expect(document.exportId).toBe("export-run-a");
    expect(document.generated.generatedAt).toBe(GENERATED_AT);
    expect(document.strategyId).toBe("baseline-strategy");
    expect(document.datasetMetadata?.datasetId).toBe("dataset-run-a");
    expect(document.summary.finalEquityCents).toBe(110_000);
    expect(document.summary.totalPnlCents).toBe(10_000);
    expect(document.summary.totalReturnPct).toBe(10);
    expect(document.summary.maxDrawdownPct).toBe(5);
    expect(document.summary.sharpeRatio).toBe(1.2);
    expect(document.summary.winRatePct).toBe(55);
    expect(document.summary.tradeCount).toBe(20);
    expect(document.rankings).toBeNull();
    expect(document.tableRows).toHaveLength(1);
    expect(document.tableRows[0]?.rowKey).toBe("run-a");
  });

  it("handles missing optional Sharpe in run exports", () => {
    const document = buildResearchRunExport({
      exportId: "export-no-sharpe",
      generated: GENERATED,
      run: researchRun("run-no-sharpe", { sharpeRatio: null }),
    });

    expect(document.summary.sharpeRatio).toBeNull();
    expect(document.tableRows[0]?.values.sharpeRatio).toBeNull();
  });
});

describe("buildResearchComparisonExport", () => {
  it("builds a comparison export with rankings and table rows", () => {
    const comparison = compareResearchExperiments([
      experiment("exp-b", { endEquityCents: 105_000, totalReturnPct: 5 }),
      experiment("exp-a", { endEquityCents: 120_000, totalReturnPct: 20 }),
    ]);

    const document = buildResearchComparisonExport({
      exportId: "export-comparison",
      generated: GENERATED,
      comparison,
    });

    expect(document.exportType).toBe(ResearchExportType.RESEARCH_COMPARISON);
    expect(document.strategyId).toBeNull();
    expect(document.datasetMetadata).toBeNull();
    expect(document.summary.finalEquityCents).toBe(120_000);
    expect(document.summary.totalPnlCents).toBeNull();
    expect(document.rankings).toHaveLength(2);
    expect(document.rankings?.[0]?.experimentId).toBe("exp-a");
    expect(document.tableRows.map((row) => row.rowKey)).toEqual(["exp-a", "exp-b"]);
  });
});

describe("serializeResearchExportDocument", () => {
  it("serializes exports deterministically", () => {
    const run = researchRun("run-serialize");
    const input = {
      exportId: "export-serialize",
      generated: GENERATED,
      run,
    };

    const first = serializeResearchExportDocument(buildResearchRunExport(input));
    const second = serializeResearchExportDocument(buildResearchRunExport(input));

    expect(first).toBe(second);
    expect(first).toContain("baseline-strategy");
  });
});

describe("research export immutability and validation", () => {
  it("returns deeply frozen export documents", () => {
    const document = buildResearchRunExport({
      exportId: "export-frozen",
      generated: GENERATED,
      run: researchRun("run-frozen"),
    });

    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.summary)).toBe(true);
    expect(Object.isFrozen(document.generated)).toBe(true);
    expect(Object.isFrozen(document.datasetMetadata)).toBe(true);
    expect(Object.isFrozen(document.tableRows)).toBe(true);
  });

  it("does not mutate input research runs", () => {
    const run = researchRun("run-unchanged");
    const before = structuredClone(run);

    buildResearchRunExport({
      exportId: "export-unchanged",
      generated: GENERATED,
      run,
    });

    expect(run).toEqual(before);
  });

  it("sorts table rows deterministically by rowKey", () => {
    const comparison = compareResearchExperiments([
      experiment("exp-z", { endEquityCents: 130_000 }),
      experiment("exp-a", { endEquityCents: 140_000 }),
      experiment("exp-m", { endEquityCents: 125_000 }),
    ]);

    const document = buildResearchComparisonExport({
      exportId: "export-table-sort",
      generated: GENERATED,
      comparison,
    });

    expect(document.tableRows.map((row) => row.rowKey)).toEqual([
      "exp-a",
      "exp-m",
      "exp-z",
    ]);
  });

  it("rejects invalid export input", () => {
    expect(() =>
      buildResearchRunExport({
        exportId: "",
        generated: GENERATED,
        run: researchRun("invalid"),
      }),
    ).toThrow(ResearchExportError);

    try {
      buildResearchRunExport({
        exportId: "",
        generated: GENERATED,
        run: researchRun("invalid"),
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: ResearchExportErrorCode.INVALID_EXPORT_ID,
      });
    }

    expect(() =>
      buildResearchRunExport({
        exportId: "missing-generated-at",
        generated: { generatedAt: "  " },
        run: researchRun("invalid-generated"),
      }),
    ).toThrow(ResearchExportError);
  });

  it("rejects invalid comparison input", () => {
    expect(() =>
      buildResearchComparisonExport({
        exportId: "invalid-comparison",
        generated: GENERATED,
        comparison: {
          comparisonId: "cmp-empty",
          winner: {
            rank: 1,
            experimentId: "exp-a",
            sweepId: "sweep",
            parameters: {},
            metrics: {
              finalEquityCents: 100_000,
              totalReturnPct: 0,
              cagrPct: null,
              sharpeRatio: null,
              maxDrawdownPct: 0,
              profitFactor: null,
              winRatePct: 0,
              expectancyCents: 0,
              tradeCount: 0,
            },
            tiedExperimentIds: ["exp-a"],
          },
          rankings: [],
          summary: {
            experimentCount: 0,
            winnerExperimentId: "exp-a",
            tiedWinnerExperimentIds: ["exp-a"],
            metricLeaders: [],
          },
          metricTable: [],
          dominance: [],
          ties: [],
        },
      }),
    ).toThrow(ResearchExportError);

    try {
      buildResearchComparisonExport({
        exportId: "invalid-comparison",
        generated: GENERATED,
        comparison: {
          comparisonId: "cmp-empty",
          winner: {
            rank: 1,
            experimentId: "exp-a",
            sweepId: "sweep",
            parameters: {},
            metrics: {
              finalEquityCents: 100_000,
              totalReturnPct: 0,
              cagrPct: null,
              sharpeRatio: null,
              maxDrawdownPct: 0,
              profitFactor: null,
              winRatePct: 0,
              expectancyCents: 0,
              tradeCount: 0,
            },
            tiedExperimentIds: ["exp-a"],
          },
          rankings: [],
          summary: {
            experimentCount: 0,
            winnerExperimentId: "exp-a",
            tiedWinnerExperimentIds: ["exp-a"],
            metricLeaders: [],
          },
          metricTable: [],
          dominance: [],
          ties: [],
        },
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: ResearchExportErrorCode.INVALID_COMPARISON,
      });
    }
  });

  it("returns deeply frozen comparison export documents", () => {
    const comparison = compareResearchExperiments([
      experiment("exp-b", { endEquityCents: 105_000, totalReturnPct: 5 }),
      experiment("exp-a", { endEquityCents: 120_000, totalReturnPct: 20 }),
    ]);

    const document = buildResearchComparisonExport({
      exportId: "export-comparison-frozen",
      generated: GENERATED,
      comparison,
    });

    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.rankings)).toBe(true);
    expect(Object.isFrozen(document.rankings?.[0])).toBe(true);
    expect(Object.isFrozen(document.rankings?.[0]?.metrics)).toBe(true);
  });
});
