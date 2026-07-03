import { describe, expect, it } from "vitest";

import { runStrategySynthesisCommand } from "./buildStrategySynthesisCandidates";

const GENERATED_AT = "2026-07-03T12:00:00.000Z";
const OUTPUT_PATH = "data/research-results/strategy-synthesis-candidates.json";

const CANDIDATES_JSON = JSON.stringify({
  generatedAt: GENERATED_AT,
  outputPath: "data/research-results/hypothesis-candidates.json",
  config: {
    minSampleSize: 30,
    minCalibrationError: 0.05,
    minLeadLagCorrelation: 0.2,
  },
  inputs: {
    mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
    leadLagAnalysisPath: "data/research-results/lead-lag-analysis.json",
    statisticalSignificancePath: "data/research-results/statistical-significance.json",
    regimeTagsPath: "data/research-results/regime-tags.json",
    strategyLeaderboardPath: "data/leaderboards/strategy-leaderboard.json",
    mispricingAtlasPresent: true,
    leadLagAnalysisPresent: false,
    statisticalSignificancePresent: false,
    regimeTagsPresent: false,
    strategyLeaderboardPresent: false,
  },
  candidates: [
    {
      candidateId: "atlas-volatility-vol-high-over",
      sourceArtifact: "mispricing-atlas.json",
      hypothesis: "High volatility appears overconfident",
      rationale: "Calibration error 10%",
      marketCondition: "High volatility",
      suggestedStrategyFamily: "calibration-no-fade",
      requiredData: ["Kalshi implied probability"],
      proposedEntryCondition: "Enter NO",
      proposedExitSettlementAssumption: "Hold through settlement",
      expectedFailureMode: "Noise",
      killCriterion: "Stop if error falls",
      confidence: "high",
      warnings: [],
    },
  ],
  summary: {
    candidateCount: 1,
    noCandidateReasons: [],
  },
});

const VALIDATION_JSON = JSON.stringify({
  generatedAt: GENERATED_AT,
  outputPath: "data/research-results/hypothesis-validation.json",
  validations: [
    {
      hypothesisId: "atlas-volatility-vol-high-over",
      robustnessScore: 85,
      passes: true,
      reasons: [],
      observationCount: 60,
    },
  ],
});

describe("runStrategySynthesisCommand", () => {
  it("writes strategy-synthesis-candidates.json from hypothesis inputs", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runStrategySynthesisCommand(
      [
        "--hypothesis-candidates",
        "custom/hypothesis-candidates.json",
        "--hypothesis-validation",
        "custom/hypothesis-validation.json",
      ],
      {
        readFile: (path) => {
          if (path === "custom/hypothesis-candidates.json") {
            return CANDIDATES_JSON;
          }
          if (path === "custom/hypothesis-validation.json") {
            return VALIDATION_JSON;
          }
          throw new Error(`unexpected read: ${path}`);
        },
        fileExists: (path) =>
          path === "custom/hypothesis-candidates.json"
          || path === "custom/hypothesis-validation.json",
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: () => {},
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: () => {},
      },
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    const serialized = writes.get(OUTPUT_PATH);
    expect(serialized).toBeDefined();

    const parsed = JSON.parse(serialized!);
    expect(parsed.generatedAt).toBe(GENERATED_AT);
    expect(parsed.strategies).toHaveLength(1);
    expect(parsed.strategies[0].promotionStatus).toBe("candidate");

    const stdoutPayload = JSON.parse(stdout);
    expect(stdoutPayload.outputPath).toBe(OUTPUT_PATH);
    expect(stdoutPayload.synthesizedCount).toBe(1);
  });

  it("returns exit code 1 when required inputs are missing", () => {
    let stderr = "";

    const exitCode = runStrategySynthesisCommand([], {
      readFile: () => {
        throw new Error("should not read");
      },
      fileExists: () => false,
      writeStdout: () => {},
      writeStderr: (text) => {
        stderr += text;
      },
      writeFile: () => {},
      mkdirSync: () => {},
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Missing hypothesis candidates input");
  });
});
