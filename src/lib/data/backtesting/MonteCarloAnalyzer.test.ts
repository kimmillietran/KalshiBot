import { describe, expect, it } from "vitest";

import { MonteCarloAnalysisError, MonteCarloErrorCode } from "./errors";
import {
  createBootstrapSequence,
  createPermutationSequence,
  DEFAULT_DETERMINISTIC_INDEX_GENERATOR,
  runMonteCarloAnalysis,
  serializeMonteCarloSummary,
  simulateEquityCurve,
} from "./MonteCarloAnalyzer";
import type { ClosedTradeSummary } from "./metricsTypes";
import { ResampleMode } from "./monteCarloTypes";

const START_TS = "2026-06-26T23:15:00.000Z";
const END_TS = "2026-06-26T23:30:00.000Z";

function trade(tradeId: string, realizedPnlCents: number): ClosedTradeSummary {
  return {
    tradeId,
    ticker: "KXBTC15M-TEST",
    openedAt: START_TS,
    closedAt: END_TS,
    realizedPnlCents,
    entryNotionalCents: 10_000,
    exitNotionalCents: 10_000 + realizedPnlCents,
  };
}

const sampleTrades = [
  trade("t1", 2_000),
  trade("t2", -1_000),
  trade("t3", 1_500),
  trade("t4", -500),
];

describe("runMonteCarloAnalysis", () => {
  it("produces deterministic repeated run output", () => {
    const input = {
      closedTrades: sampleTrades,
      config: {
        simulationCount: 8,
        resampleMode: ResampleMode.BOOTSTRAP,
        startingEquityCents: 100_000,
        seed: 42,
      },
    };

    const first = serializeMonteCarloSummary(runMonteCarloAnalysis(input));
    const second = serializeMonteCarloSummary(runMonteCarloAnalysis(input));

    expect(first).toBe(second);
  });

  it("supports bootstrap resampling mode", () => {
    const summary = runMonteCarloAnalysis({
      closedTrades: sampleTrades,
      config: {
        simulationCount: 3,
        resampleMode: ResampleMode.BOOTSTRAP,
        startingEquityCents: 100_000,
        seed: 7,
      },
    });

    expect(summary.simulations).toHaveLength(3);
    expect(summary.simulations[0]?.simulationIndex).toBe(0);
    expect(summary.meanEndingEquity).toBeGreaterThan(0);
  });

  it("supports permutation resampling mode", () => {
    const bootstrap = runMonteCarloAnalysis({
      closedTrades: sampleTrades,
      config: {
        simulationCount: 5,
        resampleMode: ResampleMode.BOOTSTRAP,
        startingEquityCents: 100_000,
        seed: 99,
      },
    });
    const permutation = runMonteCarloAnalysis({
      closedTrades: sampleTrades,
      config: {
        simulationCount: 5,
        resampleMode: ResampleMode.PERMUTATION,
        startingEquityCents: 100_000,
        seed: 99,
      },
    });

    expect(
      serializeMonteCarloSummary(bootstrap),
    ).not.toBe(serializeMonteCarloSummary(permutation));
  });

  it("computes percentiles, mean, median, and min/max ending equity", () => {
    const summary = runMonteCarloAnalysis({
      closedTrades: sampleTrades,
      config: {
        simulationCount: 20,
        resampleMode: ResampleMode.BOOTSTRAP,
        startingEquityCents: 100_000,
        seed: 13,
      },
    });

    expect(summary.percentile5).toBeLessThanOrEqual(summary.percentile25);
    expect(summary.percentile25).toBeLessThanOrEqual(summary.percentile50);
    expect(summary.percentile50).toBe(summary.medianEndingEquity);
    expect(summary.percentile75).toBeLessThanOrEqual(summary.percentile95);
    expect(summary.worstEndingEquity).toBeLessThanOrEqual(summary.meanEndingEquity);
    expect(summary.meanEndingEquity).toBeLessThanOrEqual(summary.bestEndingEquity);
  });

  it("computes drawdown statistics per simulation", () => {
    const summary = runMonteCarloAnalysis({
      closedTrades: [trade("win", 5_000), trade("loss", -8_000), trade("win", 3_000)],
      config: {
        simulationCount: 4,
        resampleMode: ResampleMode.PERMUTATION,
        startingEquityCents: 100_000,
        seed: 3,
      },
    });

    expect(summary.averageDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(summary.worstDrawdownPct).toBeGreaterThanOrEqual(
      summary.averageDrawdownPct,
    );
    expect(summary.simulations.every((run) => run.maxDrawdownPct >= 0)).toBe(true);
  });

  it("rejects empty trade lists", () => {
    expect(() =>
      runMonteCarloAnalysis({
        closedTrades: [],
        config: {
          simulationCount: 5,
          resampleMode: ResampleMode.BOOTSTRAP,
          startingEquityCents: 100_000,
          seed: 1,
        },
      }),
    ).toThrow(MonteCarloAnalysisError);

    try {
      runMonteCarloAnalysis({
        closedTrades: [],
        config: {
          simulationCount: 5,
          resampleMode: ResampleMode.BOOTSTRAP,
          startingEquityCents: 100_000,
          seed: 1,
        },
      });
    } catch (error) {
      expect((error as MonteCarloAnalysisError).code).toBe(
        MonteCarloErrorCode.EMPTY_TRADE_LIST,
      );
    }
  });

  it("rejects invalid config values", () => {
    expect(() =>
      runMonteCarloAnalysis({
        closedTrades: sampleTrades,
        config: {
          simulationCount: 0,
          resampleMode: ResampleMode.BOOTSTRAP,
          startingEquityCents: 100_000,
          seed: 1,
        },
      }),
    ).toThrow(MonteCarloAnalysisError);

    expect(() =>
      runMonteCarloAnalysis({
        closedTrades: sampleTrades,
        config: {
          simulationCount: 2,
          resampleMode: ResampleMode.BOOTSTRAP,
          startingEquityCents: 0,
          seed: 1,
        },
      }),
    ).toThrow(MonteCarloAnalysisError);
  });

  it("serializes summaries stably", () => {
    const summary = runMonteCarloAnalysis({
      closedTrades: sampleTrades,
      config: {
        simulationCount: 2,
        resampleMode: ResampleMode.PERMUTATION,
        startingEquityCents: 50_000,
        seed: 5,
      },
    });

    expect(serializeMonteCarloSummary(summary)).toContain("medianEndingEquity");
    expect(serializeMonteCarloSummary(summary)).toBe(
      serializeMonteCarloSummary(summary),
    );
  });

  it("does not mutate input arrays", () => {
    const closedTrades = [...sampleTrades];
    const snapshot = JSON.stringify(closedTrades);

    runMonteCarloAnalysis({
      closedTrades,
      config: {
        simulationCount: 3,
        resampleMode: ResampleMode.BOOTSTRAP,
        startingEquityCents: 100_000,
        seed: 11,
      },
    });

    expect(JSON.stringify(closedTrades)).toBe(snapshot);
  });

  it("uses injected deterministic index generators", () => {
    const summary = runMonteCarloAnalysis({
      closedTrades: sampleTrades,
      config: {
        simulationCount: 2,
        resampleMode: ResampleMode.BOOTSTRAP,
        startingEquityCents: 100_000,
        seed: 1,
      },
      indexGenerator: () => 0,
    });

    const expected = simulateEquityCurve(
      createBootstrapSequence(
        sampleTrades,
        1,
        0,
        () => 0,
      ),
      100_000,
    );

    expect(summary.simulations[0]?.endingEquityCents).toBe(
      expected.endingEquityCents,
    );
  });

  it("supports simulationCount of 1", () => {
    const summary = runMonteCarloAnalysis({
      closedTrades: sampleTrades,
      config: {
        simulationCount: 1,
        resampleMode: ResampleMode.BOOTSTRAP,
        startingEquityCents: 100_000,
        seed: 42,
      },
    });

    expect(summary.simulations).toHaveLength(1);
    expect(summary.percentile50).toBe(summary.medianEndingEquity);
    expect(summary.percentile5).toBe(summary.percentile95);
  });

  it("produces different output for different seeds", () => {
    const baseConfig = {
      simulationCount: 5,
      resampleMode: ResampleMode.BOOTSTRAP,
      startingEquityCents: 100_000,
    } as const;

    const seedA = serializeMonteCarloSummary(
      runMonteCarloAnalysis({
        closedTrades: sampleTrades,
        config: { ...baseConfig, seed: 1 },
      }),
    );
    const seedB = serializeMonteCarloSummary(
      runMonteCarloAnalysis({
        closedTrades: sampleTrades,
        config: { ...baseConfig, seed: 2 },
      }),
    );

    expect(seedA).not.toBe(seedB);
  });

  it("allows bootstrap duplicate sampling", () => {
    const summary = runMonteCarloAnalysis({
      closedTrades: sampleTrades,
      config: {
        simulationCount: 1,
        resampleMode: ResampleMode.BOOTSTRAP,
        startingEquityCents: 100_000,
        seed: 99,
      },
      indexGenerator: () => 0,
    });

    const expectedEnding = 100_000 + sampleTrades[0]!.realizedPnlCents * sampleTrades.length;
    expect(summary.simulations[0]?.endingEquityCents).toBe(expectedEnding);
  });

  it("returns frozen summary and simulation objects", () => {
    const summary = runMonteCarloAnalysis({
      closedTrades: sampleTrades,
      config: {
        simulationCount: 2,
        resampleMode: ResampleMode.PERMUTATION,
        startingEquityCents: 100_000,
        seed: 4,
      },
    });

    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(summary.simulations)).toBe(true);
    expect(Object.isFrozen(summary.simulations[0])).toBe(true);

    expect(() => {
      (summary as { meanEndingEquity: number }).meanEndingEquity = 0;
    }).toThrow();
  });
});

describe("deterministic resamplers", () => {
  it("creates stable bootstrap and permutation sequences", () => {
    const bootstrapA = createBootstrapSequence(
      sampleTrades,
      10,
      0,
      DEFAULT_DETERMINISTIC_INDEX_GENERATOR,
    );
    const bootstrapB = createBootstrapSequence(
      sampleTrades,
      10,
      0,
      DEFAULT_DETERMINISTIC_INDEX_GENERATOR,
    );
    const permutation = createPermutationSequence(
      sampleTrades,
      10,
      0,
      DEFAULT_DETERMINISTIC_INDEX_GENERATOR,
    );

    expect(bootstrapA).toEqual(bootstrapB);
    expect(bootstrapA).toHaveLength(sampleTrades.length);
    expect(permutation).toHaveLength(sampleTrades.length);
    expect(new Set(permutation.map((entry) => entry.tradeId)).size).toBe(
      sampleTrades.length,
    );
  });
});
