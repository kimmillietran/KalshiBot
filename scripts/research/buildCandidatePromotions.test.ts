import { describe, expect, it } from "vitest";

import { runCandidatePromotionCommand } from "./buildCandidatePromotions";

const GENERATED_AT = "2026-07-03T23:00:00.000Z";
const OUTPUT_PATH = "data/research-results/candidate-promotions.json";
const HTML_PATH = "data/reports/research-candidate-promotions.html";

const validation = {
  generatedAt: GENERATED_AT,
  validations: [
    {
      hypothesisId: "atlas-vol-high-over",
      robustnessScore: 88,
      passes: true,
      reasons: [],
      observationCount: 30,
      sampleConcentration: {
        singleDayDominated: false,
        largestDayPercent: 0.1,
      },
    },
  ],
};

const synthesis = {
  generatedAt: GENERATED_AT,
  strategies: [
    {
      strategyId: "synth-atlas-vol-high-over",
      hypothesisId: "atlas-vol-high-over",
      strategyFamily: "calibration-fade",
      promotionStatus: "candidate",
      validationSummary: {
        robustnessScore: 88,
        passes: true,
        observationCount: 30,
      },
      riskNotes: [],
    },
  ],
};

const harnessResults = {
  generatedAt: GENERATED_AT,
  strategies: [
    {
      strategyId: "synth-atlas-vol-high-over",
      hypothesisId: "atlas-vol-high-over",
      strategyFamily: "calibration-fade",
      marketRuns: 10,
      successfulRuns: 8,
      failedRuns: 2,
      skippedRuns: 0,
      totalTradeCount: 22,
      netPnlCents: 900,
      warnings: [],
    },
  ],
};

describe("runCandidatePromotionCommand", () => {
  it("writes JSON and HTML candidate promotion outputs", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runCandidatePromotionCommand([], {
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: () => {},
      writeFile: (path, data) => {
        writes.set(path, data);
      },
      mkdirSync: () => {},
      readFile: (path) => {
        if (path.endsWith("hypothesis-validation.json")) {
          return JSON.stringify(validation);
        }
        if (path.endsWith("strategy-synthesis-candidates.json")) {
          return JSON.stringify(synthesis);
        }
        if (path.endsWith("harness-results.json")) {
          return JSON.stringify(harnessResults);
        }
        throw new Error(`unexpected read ${path}`);
      },
      fileExists: (path) =>
        path.endsWith("hypothesis-validation.json")
        || path.endsWith("strategy-synthesis-candidates.json")
        || path.endsWith("harness-results.json"),
      readdir: () => [],
      isDirectory: () => false,
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(0);
    expect(writes.has(OUTPUT_PATH)).toBe(true);
    expect(writes.has(HTML_PATH)).toBe(true);

    const parsed = JSON.parse(writes.get(OUTPUT_PATH)!);
    expect(parsed.generatedAt).toBe(GENERATED_AT);
    expect(parsed.promotions).toHaveLength(1);
    expect(writes.get(HTML_PATH)).toContain("Research Candidate Promotions");
    expect(JSON.parse(stdout.trim()).outputPath).toBe(OUTPUT_PATH);
  });
});
