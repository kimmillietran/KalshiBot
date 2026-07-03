import { describe, expect, it } from "vitest";

import { buildHypothesisConfidenceSummary } from "./collectHypothesisExampleMarkets";

describe("buildHypothesisConfidenceSummary", () => {
  it("describes sample size, trading days, and calibration error", () => {
    const summary = buildHypothesisConfidenceSummary({
      sampleSize: 150,
      uniqueTradingDays: 87,
      calibrationError: 0.231,
      statisticalSignificance: null,
      confidenceLevel: "low",
    });

    expect(summary).toContain("150 historical observations");
    expect(summary).toContain("87 unique trading days");
    expect(summary).toContain("23.1 percentage points");
    expect(summary).toContain("exploratory");
  });

  it("notes missing observations", () => {
    const summary = buildHypothesisConfidenceSummary({
      sampleSize: 0,
      uniqueTradingDays: 0,
      calibrationError: null,
      statisticalSignificance: {
        generatedAt: "2026-07-02T00:00:00.000Z",
        inputRoot: "data/research-results",
        outputPath: "data/research-results/statistical-significance.json",
        config: {
          seed: 42,
          simulationCount: 1000,
          confidenceLevel: 0.95,
          significanceAlpha: 0.05,
        },
        strategies: [
          {
            strategyId: "noop",
            sampleSize: 100,
            completedMarkets: 100,
            totalTrades: 200,
            meanPnlCents: 10,
            meanPnlStandardError: 1,
            meanPnlTStatistic: 2,
            meanPnlPValueOneTailed: 0.01,
            meanPnlBootstrapConfidenceInterval: null,
            winRatePct: 55,
            winRateBootstrapConfidenceInterval: null,
            confidenceInterval95: {
              meanPnlCents: null,
              winRatePct: null,
            },
            statisticallySignificant: true,
            insufficientSample: false,
            warnings: [],
            sourcePaths: [],
          },
        ],
      },
      confidenceLevel: "low",
    });

    expect(summary).toContain("no linked historical observations");
  });
});
