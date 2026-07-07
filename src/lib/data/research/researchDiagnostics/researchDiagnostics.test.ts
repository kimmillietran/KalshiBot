import { describe, expect, it } from "vitest";

import { buildResearchDiagnosticsSection } from "./buildResearchDiagnosticsSection";
import { loadResearchDiagnosticsInputs } from "./loadResearchDiagnosticsInputs";
import { DEFAULT_RESEARCH_DIAGNOSTICS_INPUT_PATHS } from "./researchDiagnosticsTypes";

const INPUT_PATHS = DEFAULT_RESEARCH_DIAGNOSTICS_INPUT_PATHS;

function createIo(files: Record<string, string>) {
  return {
    readFile: (path: string) => files[path] ?? "",
    fileExists: (path: string) => path in files,
  };
}

describe("loadResearchDiagnosticsInputs", () => {
  it("returns null documents when diagnostics are missing", () => {
    const loaded = loadResearchDiagnosticsInputs(createIo({}), INPUT_PATHS);

    expect(loaded.hypothesisFailureAnalysis).toBeNull();
    expect(loaded.derivedSettlementSensitivity).toBeNull();
    expect(loaded.hypothesisRefinements).toBeNull();
    expect(loaded.strategySynthesisDebug).toBeNull();
  });

  it("loads summary metrics from source JSON", () => {
    const loaded = loadResearchDiagnosticsInputs(
      createIo({
        [INPUT_PATHS.hypothesisFailureAnalysisPath]: JSON.stringify({
          generatedAt: "2026-07-07T03:29:15.026Z",
          htmlOutputPath: "data/reports/hypothesis-failure-analysis.html",
          summary: {
            nearPromisingCount: 2,
            highestRobustnessScore: 59,
            totalHypotheses: 5,
          },
        }),
        [INPUT_PATHS.derivedSettlementSensitivityPath]: JSON.stringify({
          generatedAt: "2026-07-07T04:00:00.000Z",
          summary: { derivedSensitiveHypothesisCount: 2, totalHypotheses: 5 },
        }),
        [INPUT_PATHS.hypothesisRefinementsPath]: JSON.stringify({
          generatedAt: "2026-07-07T04:05:00.000Z",
          summary: { refinementCandidateCount: 3 },
        }),
        [INPUT_PATHS.strategySynthesisDebugPath]: JSON.stringify({
          generatedAt: "2026-07-07T04:10:00.000Z",
          summary: {
            funnelStatus: "candidate-ready",
            harnessCandidateCount: 4,
            synthesizedCount: 6,
          },
        }),
      }),
      INPUT_PATHS,
    );

    expect(loaded.hypothesisFailureAnalysis?.summary?.nearPromisingCount).toBe(2);
    expect(loaded.derivedSettlementSensitivity?.summary?.derivedSensitiveHypothesisCount).toBe(2);
    expect(loaded.hypothesisRefinements?.summary?.refinementCandidateCount).toBe(3);
    expect(loaded.strategySynthesisDebug?.summary?.funnelStatus).toBe("candidate-ready");
  });
});

describe("buildResearchDiagnosticsSection", () => {
  it("builds cards for all diagnostics when present", () => {
    const loaded = loadResearchDiagnosticsInputs(
      createIo({
        [INPUT_PATHS.hypothesisFailureAnalysisPath]: JSON.stringify({
          generatedAt: "2026-07-07T03:29:15.026Z",
          summary: { nearPromisingCount: 2, highestRobustnessScore: 59 },
        }),
        [INPUT_PATHS.derivedSettlementSensitivityPath]: JSON.stringify({
          generatedAt: "2026-07-07T04:00:00.000Z",
          summary: { derivedSensitiveHypothesisCount: 2 },
        }),
        [INPUT_PATHS.hypothesisRefinementsPath]: JSON.stringify({
          generatedAt: "2026-07-07T04:05:00.000Z",
          summary: { refinementCandidateCount: 3 },
        }),
        [INPUT_PATHS.strategySynthesisDebugPath]: JSON.stringify({
          generatedAt: "2026-07-07T04:10:00.000Z",
          summary: { funnelStatus: "candidate-ready", harnessCandidateCount: 4 },
        }),
      }),
      INPUT_PATHS,
    );

    const section = buildResearchDiagnosticsSection({ inputPaths: INPUT_PATHS, loaded });

    expect(section.availableCount).toBe(4);
    expect(section.nearPromisingHypothesisCount).toBe(2);
    expect(section.highestRobustnessScore).toBe(59);
    expect(section.derivedSensitiveHypothesisCount).toBe(2);
    expect(section.refinementCandidateCount).toBe(3);
    expect(section.strategySynthesisFunnelStatus).toBe("candidate-ready");
    expect(section.harnessCandidateCount).toBe(4);
    expect(section.cards.every((card) => card.present)).toBe(true);
  });

  it("handles missing diagnostics gracefully", () => {
    const loaded = loadResearchDiagnosticsInputs(createIo({}), INPUT_PATHS);
    const section = buildResearchDiagnosticsSection({ inputPaths: INPUT_PATHS, loaded });

    expect(section.availableCount).toBe(0);
    expect(section.nearPromisingHypothesisCount).toBeNull();
    expect(section.cards.every((card) => !card.present)).toBe(true);
  });
});
