import { describe, expect, it } from "vitest";

import { runHypothesisHistoryCommand } from "./buildHypothesisHistory";

const GENERATED_AT = "2026-07-05T12:00:00.000Z";
const HISTORY_PATH = "data/research-results/hypothesis-history.json";
const HTML_PATH = "data/reports/hypothesis-evolution.html";

const CANDIDATES = JSON.stringify({
  generatedAt: GENERATED_AT,
  candidates: [
    {
      candidateId: "hyp-a",
      hypothesis: "Medium vol × 30-70%",
      confidence: "medium",
      bucketMetadata: { calibrationError: 0.1 },
    },
  ],
});

const VALIDATION = JSON.stringify({
  generatedAt: GENERATED_AT,
  validations: [
    {
      hypothesisId: "hyp-a",
      hypothesis: "Medium vol × 30-70%",
      robustnessScore: 49,
      passes: false,
      observationCount: 170,
      timeStability: {
        monthPeriods: [{ observations: 80 }, { observations: 90 }],
        monthPersistenceRate: 0.5,
      },
      regimeStability: { regimesWithData: 3, regimesWithEdge: 1 },
      sampleConcentration: { uniqueTradingDays: 12 },
      leaveOnePeriodOut: { errorStdDev: 0.06 },
    },
  ],
});

describe("buildHypothesisHistory CLI", () => {
  it("returns non-zero when required artifacts are missing", () => {
    let stderr = "";

    const exitCode = runHypothesisHistoryCommand([], {
      readFile: () => "",
      fileExists: () => false,
      writeStdout: () => {},
      writeStderr: (text) => {
        stderr += text;
      },
      writeFile: () => {},
      mkdirSync: () => {},
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Missing required");
  });

  it("writes hypothesis history JSON and evolution HTML", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runHypothesisHistoryCommand([], {
      readFile: (path) => {
        if (path.endsWith("hypothesis-candidates.json")) {
          return CANDIDATES;
        }
        if (path.endsWith("hypothesis-validation.json")) {
          return VALIDATION;
        }
        return "{}";
      },
      fileExists: (path) =>
        path.endsWith("hypothesis-candidates.json")
        || path.endsWith("hypothesis-validation.json"),
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: () => {},
      writeFile: (path, data) => {
        writes.set(path, data);
      },
      mkdirSync: () => {},
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(0);
    expect(writes.has(HISTORY_PATH)).toBe(true);
    expect(writes.has(HTML_PATH)).toBe(true);
    expect(writes.get(HTML_PATH)).toContain("Hypothesis Evolution");
    expect(JSON.parse(writes.get(HISTORY_PATH)!).runs).toHaveLength(1);
    expect(JSON.parse(stdout).runCount).toBe(1);
  });
});
