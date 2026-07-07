import { describe, expect, it } from "vitest";

import { runResearchRecommendationEngineCommand } from "./buildResearchRecommendationEngine";
import { DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS } from "@/lib/data/research/researchRecommendationEngine";

const GENERATED_AT = "2026-07-07T23:00:00.000Z";
const OUTPUT_PATH = "data/research-results/research-recommendations.json";
const HTML_PATH = "data/reports/research-recommendations.html";

describe("runResearchRecommendationEngineCommand", () => {
  it("writes recommendation json and html outputs", () => {
    const files: Record<string, string> = {
      [DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS.roiAnalysisPath]:
        JSON.stringify({
          entries: [{ researchFamily: "momentum", roiScore: 0.9, yieldPerHour: 0.8 }],
        }),
    };
    let stdout = "";

    const exitCode = runResearchRecommendationEngineCommand(
      ["--output", OUTPUT_PATH, "--html-output", HTML_PATH],
      {
        readFile: (path) => files[path] ?? "",
        fileExists: (path) => path in files,
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: () => undefined,
        writeFile: (path, data) => {
          files[path] = data;
        },
        mkdirSync: () => undefined,
      },
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    expect(files[OUTPUT_PATH]).toBeDefined();
    expect(files[HTML_PATH]).toContain("Research Recommendations");
    expect(JSON.parse(stdout).recommendationCount).toBeGreaterThan(0);
  });
});
