import { describe, expect, it } from "vitest";

import {
  buildOosPowerCorrectionReport,
  serializeOosPowerCorrectionReport,
} from "./buildOosPowerCorrectionReport";
import { serializeOosPowerCorrectionHtml } from "./serializeOosPowerCorrectionHtml";

describe("buildOosPowerCorrectionReport", () => {
  it("builds an empty report when candidates are missing", () => {
    const report = buildOosPowerCorrectionReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "data/research-results/oos-power-correction.json",
      htmlOutputPath: "data/reports/oos-power-correction.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisTradeReplayPath: "data/research-results/hypothesis-trade-replay.json",
        researchResultsDir: "data/research-results",
        regimeTagsPath: "data/research-results/regime-tags.json",
      },
      io: {
        readFile: () => "",
        fileExists: () => false,
        readdir: () => [],
        isDirectory: () => true,
      },
    });

    expect(report.summary.candidateCount).toBe(0);
    expect(report.limitations.length).toBeGreaterThan(0);
    expect(serializeOosPowerCorrectionReport(report)).toContain("oos-power-correction");
    expect(serializeOosPowerCorrectionHtml(report)).toContain("Split summary");
  });

  it("serializes deterministically for identical input", () => {
    const input = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "data/research-results/oos-power-correction.json",
      htmlOutputPath: "data/reports/oos-power-correction.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisTradeReplayPath: "data/research-results/hypothesis-trade-replay.json",
        researchResultsDir: "data/research-results",
        regimeTagsPath: "data/research-results/regime-tags.json",
      },
      io: {
        readFile: () => "",
        fileExists: () => false,
        readdir: () => [],
        isDirectory: () => true,
      },
    };

    const first = serializeOosPowerCorrectionReport(buildOosPowerCorrectionReport(input));
    const second = serializeOosPowerCorrectionReport(buildOosPowerCorrectionReport(input));

    expect(first).toBe(second);
  });
});
