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
  ResearchExportJsonError,
  ResearchExportJsonErrorCode,
} from "./ResearchExportJson";
import {
  formatResearchExportJson,
  formatResearchExportSummaryJson,
} from "./ResearchExportJson";
import type { HistoricalResearchRun, ResearchExportDocument } from "./researchExportTypes";
import {
  buildResearchComparisonExport,
  buildResearchRunExport,
  serializeResearchExportDocument,
} from "./ResearchExport";

const GENERATED = {
  generatedAt: "2026-06-27T12:00:00.000Z",
  generatedBy: "json-formatter-test",
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
    executionCostSummary: {
      modelKind: "zero",
      fillCount: 0,
      totalFeeCents: 0,
      averageFeeCentsPerFill: null,
    },
    ...overrides,
  };
}

function backtestResult(): HistoricalBacktestResult {
  const ledger = BacktestLedger.create(100_000);

  return {
    replayResult: { results: [] },
    strategyRun: {
      strategyId: "baseline-strategy",
      ledger,
      steps: [],
    },
    ledger,
    metrics: metrics(),
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

function researchRun(runId: string): HistoricalResearchRun {
  return {
    datasetMetadata: {
      datasetId: `dataset-${runId}`,
      contractVersion: DATA_CONTRACT_VERSION,
      snapshotCount: 5,
      marketTickers: ["KXBTC15M-TEST"],
    },
    backtestResult: backtestResult(),
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
    sweepId: "json-sweep",
    parameters: { strategy: experimentId },
    status: "completed",
    metrics: metrics(metricOverrides),
  };
}

function runExportDocument(): ResearchExportDocument {
  return buildResearchRunExport({
    exportId: "export-run-json",
    generated: GENERATED,
    run: researchRun("run-json"),
  });
}

function comparisonExportDocument(): ResearchExportDocument {
  const comparison = compareResearchExperiments([
    experiment("exp-b", { endEquityCents: 105_000 }),
    experiment("exp-a", { endEquityCents: 120_000 }),
  ]);

  return buildResearchComparisonExport({
    exportId: "export-comparison-json",
    generated: GENERATED,
    comparison,
  });
}

describe("formatResearchExportJson", () => {
  it("formats research-run exports as compact JSON", () => {
    const document = runExportDocument();
    const json = formatResearchExportJson(document, {
      pretty: false,
      trailingNewline: false,
    });

    expect(json).toBe(serializeResearchExportDocument(document));
    expect(json).toContain('"exportId":"export-run-json"');
    expect(json).not.toContain("\n");
  });

  it("formats research-run exports as pretty JSON", () => {
    const document = runExportDocument();
    const json = formatResearchExportJson(document, {
      pretty: true,
      trailingNewline: false,
    });

    expect(json).toContain('"exportId": "export-run-json"');
    expect(json).toContain('\n  "summary": {');
    expect(json.endsWith("\n")).toBe(false);
  });

  it("formats comparison exports", () => {
    const document = comparisonExportDocument();
    const json = formatResearchExportJson(document, {
      pretty: true,
      trailingNewline: true,
    });

    expect(json).toContain('"exportType": "research-comparison"');
    expect(json).toContain('"experimentId": "exp-a"');
    expect(json.endsWith("\n")).toBe(true);
  });

  it("applies trailing newline options deterministically", () => {
    const document = runExportDocument();

    const withNewline = formatResearchExportJson(document, {
      pretty: false,
      trailingNewline: true,
    });
    const withoutNewline = formatResearchExportJson(document, {
      pretty: false,
      trailingNewline: false,
    });

    expect(withNewline).toBe(`${withoutNewline}\n`);
  });

  it("produces deterministic repeated output", () => {
    const document = runExportDocument();
    const options = { pretty: true, trailingNewline: true };

    const first = formatResearchExportJson(document, options);
    const second = formatResearchExportJson(document, options);

    expect(first).toBe(second);
  });

  it("round-trips compact JSON with JSON.parse", () => {
    const document = runExportDocument();
    const json = formatResearchExportJson(document, {
      pretty: false,
      trailingNewline: false,
    });

    const parsed = JSON.parse(json) as { exportId: string };
    expect(parsed.exportId).toBe("export-run-json");
  });

  it("round-trips pretty JSON with JSON.parse", () => {
    const document = comparisonExportDocument();
    const json = formatResearchExportJson(document, {
      pretty: true,
      trailingNewline: false,
    });

    const parsed = JSON.parse(json) as { exportType: string };
    expect(parsed.exportType).toBe("research-comparison");
  });

  it("does not mutate the input document", () => {
    const document = runExportDocument();
    const before = serializeResearchExportDocument(document);

    formatResearchExportJson(document, { pretty: true, trailingNewline: true });

    expect(serializeResearchExportDocument(document)).toBe(before);
  });

  it("rejects invalid export documents", () => {
    const invalid = {
      ...runExportDocument(),
      exportId: "  ",
    } as ResearchExportDocument;

    expect(() => formatResearchExportJson(invalid)).toThrow(ResearchExportJsonError);

    try {
      formatResearchExportJson(invalid);
    } catch (error) {
      expect(error).toMatchObject({
        code: ResearchExportJsonErrorCode.INVALID_EXPORT_DOCUMENT,
      });
    }
  });
});

describe("formatResearchExportSummaryJson", () => {
  it("formats a compact summary payload", () => {
    const document = runExportDocument();
    const json = formatResearchExportSummaryJson(document, {
      pretty: false,
      trailingNewline: false,
    });

    expect(json).toContain('"datasetId":"dataset-run-json"');
    expect(json).toContain('"strategyId":"baseline-strategy"');
    expect(json).not.toContain('"tableRows"');
  });

  it("uses null winner and ranking fields for run exports", () => {
    const document = runExportDocument();
    const parsed = JSON.parse(
      formatResearchExportSummaryJson(document, {
        pretty: false,
        trailingNewline: false,
      }),
    ) as {
      winnerExperimentId: string | null;
      rankingCount: number | null;
    };

    expect(parsed.winnerExperimentId).toBeNull();
    expect(parsed.rankingCount).toBeNull();
  });

  it("formats a pretty comparison summary payload", () => {
    const document = comparisonExportDocument();
    const json = formatResearchExportSummaryJson(document, {
      pretty: true,
      trailingNewline: true,
    });

    expect(json).toContain('"winnerExperimentId": "exp-a"');
    expect(json).toContain('"rankingCount": 2');
    expect(json.endsWith("\n")).toBe(true);
  });
});
