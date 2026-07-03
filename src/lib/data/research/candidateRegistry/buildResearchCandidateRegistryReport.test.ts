import { describe, expect, it } from "vitest";

import {
  buildResearchCandidateRegistryReportFromInputs,
  serializeResearchCandidateRegistryReport,
} from "./buildResearchCandidateRegistryReport";
import {
  loadExistingResearchCandidateRegistry,
  loadResearchCandidateRegistryInputs,
} from "./loadResearchCandidateRegistryInputs";
import { serializeResearchCandidateRegistryHtml } from "./serializeResearchCandidateRegistryHtml";
import {
  DEFAULT_RESEARCH_CANDIDATE_REGISTRY_HTML_PATH,
  DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS,
  DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH,
  type ResearchCandidateRegistryIo,
  type ResearchCandidateRegistryReport,
} from "./researchCandidateRegistryTypes";

const GENERATED_AT = "2026-07-03T22:00:00.000Z";
const UPDATED_AT = "2026-07-03T23:00:00.000Z";

type MockFs = { files: Record<string, string> };

function createIo(mock: MockFs): ResearchCandidateRegistryIo {
  return {
    readFile: (path) => mock.files[path] ?? "",
    fileExists: (path) => mock.files[path] !== undefined,
  };
}

function addFile(mock: MockFs, path: string, content: string): void {
  mock.files[path] = content;
}

function createHealthyFixture(): MockFs {
  const mock: MockFs = { files: {} };

  addFile(
    mock,
    DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS.hypothesisCandidatesPath,
    JSON.stringify({
      generatedAt: "2026-07-03T20:00:00.000Z",
      candidates: [
        {
          candidateId: "hyp-a",
          suggestedStrategyFamily: "calibration-no-fade",
          warnings: [],
        },
        {
          candidateId: "hyp-z",
          suggestedStrategyFamily: "calibration-no-fade",
          warnings: ["Low sample warning."],
        },
      ],
    }),
  );

  addFile(
    mock,
    DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS.hypothesisValidationPath,
    JSON.stringify({
      generatedAt: "2026-07-03T20:10:00.000Z",
      validations: [
        {
          hypothesisId: "hyp-a",
          robustnessScore: 84,
          passes: true,
          reasons: ["Robustness score 84 meets promotion threshold."],
        },
        {
          hypothesisId: "hyp-z",
          robustnessScore: 41,
          passes: false,
          reasons: ["Robustness score 41 is below promotion threshold (70)."],
        },
      ],
    }),
  );

  addFile(
    mock,
    DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS.strategySynthesisPath,
    JSON.stringify({
      generatedAt: "2026-07-03T20:20:00.000Z",
      strategies: [
        {
          strategyId: "synth-a",
          hypothesisId: "hyp-a",
          strategyFamily: "calibration-fade",
          promotionStatus: "candidate",
          validationSummary: { robustnessScore: 84, passes: true },
          riskNotes: [],
        },
      ],
    }),
  );

  addFile(
    mock,
    DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS.harnessResultsPath,
    JSON.stringify({
      completedAt: "2026-07-03T20:30:00.000Z",
      results: [
        {
          synthesizedStrategyId: "synth-a",
          hypothesisId: "hyp-a",
          status: "success",
          errorMessage: null,
        },
      ],
    }),
  );

  return mock;
}

describe("buildResearchCandidateRegistryReport", () => {
  it("builds an empty registry when no artifacts exist", () => {
    const report = buildResearchCandidateRegistryReportFromInputs(
      GENERATED_AT,
      DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH,
      DEFAULT_RESEARCH_CANDIDATE_REGISTRY_HTML_PATH,
      DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS,
      loadResearchCandidateRegistryInputs(createIo({ files: {} }), DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS),
      null,
    );

    expect(report.candidates).toEqual([]);
    expect(report.summary.totalCandidates).toBe(0);
  });

  it("registers candidates with stable ids and deterministic ordering", () => {
    const report = buildResearchCandidateRegistryReportFromInputs(
      GENERATED_AT,
      DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH,
      DEFAULT_RESEARCH_CANDIDATE_REGISTRY_HTML_PATH,
      DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS,
      loadResearchCandidateRegistryInputs(
        createIo(createHealthyFixture()),
        DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS,
      ),
      null,
    );

    expect(report.candidates.map((entry) => entry.candidateId)).toEqual(["hyp-a", "hyp-z"]);
    expect(report.candidates[0]?.currentStatus).toBe("candidate");
    expect(report.candidates[0]?.strategyId).toBe("synth-a");
    expect(report.candidates[1]?.currentStatus).toBe("rejected");
    expect(report.summary.rejectedCount).toBe(1);
  });

  it("preserves existing candidate ids and appends promotion history on status change", () => {
    const mock = createHealthyFixture();
    const existing: ResearchCandidateRegistryReport = {
      generatedAt: GENERATED_AT,
      outputPath: DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH,
      htmlOutputPath: DEFAULT_RESEARCH_CANDIDATE_REGISTRY_HTML_PATH,
      inputPaths: DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS,
      summary: {
        totalCandidates: 1,
        hypothesisCount: 0,
        validatedCount: 1,
        synthesizedCount: 0,
        backtestedCount: 0,
        candidateCount: 0,
        rejectedCount: 0,
      },
      candidates: [
        {
          candidateId: "hyp-a",
          hypothesisId: "hyp-a",
          strategyId: null,
          strategyFamily: "calibration-no-fade",
          creationTimestamp: "2026-07-03T19:00:00.000Z",
          validationScore: 84,
          harnessMetrics: null,
          currentStatus: "validated",
          rejectionReasons: [],
          promotionHistory: [
            {
              timestamp: GENERATED_AT,
              previousStatus: null,
              nextStatus: "validated",
              reason: "Initial registry status recorded as validated.",
            },
          ],
        },
      ],
    };

    addFile(mock, DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH, JSON.stringify(existing));

    const report = buildResearchCandidateRegistryReportFromInputs(
      UPDATED_AT,
      DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH,
      DEFAULT_RESEARCH_CANDIDATE_REGISTRY_HTML_PATH,
      DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS,
      loadResearchCandidateRegistryInputs(createIo(mock), DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS),
      loadExistingResearchCandidateRegistry(createIo(mock), DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH),
    );

    const promoted = report.candidates.find((entry) => entry.candidateId === "hyp-a");
    expect(promoted?.candidateId).toBe("hyp-a");
    expect(promoted?.creationTimestamp).toBe("2026-07-03T19:00:00.000Z");
    expect(promoted?.currentStatus).toBe("candidate");
    expect(promoted?.promotionHistory).toHaveLength(2);
    expect(promoted?.promotionHistory[1]?.nextStatus).toBe("candidate");
  });

  it("serializes stable JSON and HTML output", () => {
    const report = buildResearchCandidateRegistryReportFromInputs(
      GENERATED_AT,
      DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH,
      DEFAULT_RESEARCH_CANDIDATE_REGISTRY_HTML_PATH,
      DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS,
      loadResearchCandidateRegistryInputs(
        createIo(createHealthyFixture()),
        DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS,
      ),
      null,
    );

    const json = serializeResearchCandidateRegistryReport(report);
    const html = serializeResearchCandidateRegistryHtml(report);

    expect(json).toContain('"candidateId": "hyp-a"');
    expect(html).toContain("Research Candidate Registry");
    expect(html).toContain("hyp-z");
  });
});
