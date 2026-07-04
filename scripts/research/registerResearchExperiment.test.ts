import { describe, expect, it } from "vitest";

import { runResearchExperimentCommand } from "./registerResearchExperiment";

const GENERATED_AT = "2026-07-04T02:00:00.000Z";
const EXPERIMENTS_DIR = "tmp/experiments";
const INDEX_PATH = "tmp/experiment-index.json";
const HTML_PATH = "tmp/research-experiments.html";

describe("runResearchExperimentCommand", () => {
  it("writes experiment record, index, and html report", () => {
    const files: Record<string, string> = {
      "data/research-results/hypothesis-candidates.json": JSON.stringify({
        summary: { candidateCount: 1 },
      }),
      "data/research-results/hypothesis-validation.json": JSON.stringify({
        summary: {
          totalHypotheses: 1,
          passingCount: 1,
          failingCount: 0,
          averageRobustnessScore: 80,
        },
      }),
      "data/research-results/candidate-promotions.json": JSON.stringify({
        summary: {
          totalStrategies: 1,
          decisionCounts: { candidate: 1 },
          watchlistCount: 0,
          rejectedCount: 0,
        },
        promotions: [
          {
            strategyId: "synth-a",
            hypothesisId: "hyp-a",
            strategyFamily: "calibration-fade",
            decision: "candidate",
            supportingMetrics: { robustnessScore: 80 },
            warnings: [],
          },
        ],
      }),
    };
    const written = new Map<string, string>();
    let stdout = "";

    const exitCode = runResearchExperimentCommand(
      [
        "--experiments-dir",
        EXPERIMENTS_DIR,
        "--index-output",
        INDEX_PATH,
        "--html-output",
        HTML_PATH,
      ],
      {
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: () => {},
        writeFile: (path, data) => {
          written.set(path, data);
        },
        mkdirSync: () => {},
        readFile: (path) => files[path] ?? written.get(path) ?? "",
        fileExists: (path) => path in files || written.has(path),
        resolveGitCommit: () => "deadbeef",
      },
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    expect(written.has(INDEX_PATH)).toBe(true);
    expect(written.has(HTML_PATH)).toBe(true);
    expect(stdout).toContain("experimentId");
    expect(written.get(HTML_PATH)).toContain("Research Experiment Manager");
  });
});
