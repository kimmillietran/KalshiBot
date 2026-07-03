import { describe, expect, it } from "vitest";

import { runHarnessResultsCommand } from "./buildHarnessResults";

const GENERATED_AT = "2026-07-03T15:00:00.000Z";

const SYNTHESIS_JSON = JSON.stringify({
  generatedAt: GENERATED_AT,
  outputPath: "data/research-results/strategy-synthesis-candidates.json",
  inputPaths: {},
  config: {},
  summary: { totalCandidates: 1, synthesizedCount: 1, promotionCounts: {}, skipReasons: [] },
  strategies: [
    {
      strategyId: "synth-atlas-volatility-vol-high-over",
      hypothesisId: "atlas-volatility-vol-high-over",
      strategyFamily: "calibration-no-fade",
      direction: "fade-yes",
      entryConditions: {
        summary: "Enter NO",
        marketCondition: "High volatility",
        atlasGroupId: "volatility",
        bucketId: "vol-high",
        calibrationDirection: "over",
        minCalibrationError: 0.05,
        leadLagCandles: null,
      },
      exitAssumption: "Hold through settlement",
      requiredData: [],
      riskNotes: [],
      validationSummary: {
        robustnessScore: 85,
        passes: true,
        observationCount: 60,
        reasons: [],
        summary: "Passed",
      },
      promotionStatus: "candidate",
    },
  ],
});

describe("runHarnessResultsCommand", () => {
  it("writes harness-results.json and HTML report", () => {
    const writes = new Map<string, string>();

    const exitCode = runHarnessResultsCommand([], {
      readFile: (path) => {
        if (path.endsWith("strategy-synthesis-candidates.json")) {
          return SYNTHESIS_JSON;
        }
        throw new Error(`unexpected read: ${path}`);
      },
      fileExists: (path) => path.endsWith("strategy-synthesis-candidates.json"),
      writeStdout: () => {},
      writeStderr: () => {},
      writeFile: (path, data) => {
        writes.set(path, data);
      },
      mkdirSync: () => {},
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(0);
    expect(writes.get("data/research-results/harness-results.json")).toBeDefined();
    expect(writes.get("data/reports/research-harness-results.html")).toContain(
      "Harness Results Report",
    );
  });
});
