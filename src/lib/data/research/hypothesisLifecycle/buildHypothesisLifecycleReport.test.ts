import { describe, expect, it } from "vitest";

import {
  buildHypothesisLifecycleReportFromInputs,
} from "./buildHypothesisLifecycleReport";
import { loadHypothesisLifecycleInputs } from "./loadHypothesisLifecycleInputs";
import { serializeHypothesisLifecycleHtml } from "./serializeHypothesisLifecycleHtml";
import {
  DEFAULT_HYPOTHESIS_LIFECYCLE_HTML_PATH,
  DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS,
  type HypothesisLifecycleIo,
  type ParsedHypothesisLifecycleInputs,
} from "./hypothesisLifecycleTypes";

const GENERATED_AT = "2026-07-03T20:00:00.000Z";

type MockFs = {
  files: Record<string, string>;
  directories: Set<string>;
  modified: Record<string, string>;
};

function createIo(mock: MockFs): HypothesisLifecycleIo {
  return {
    readFile: (path) => mock.files[path] ?? "",
    fileExists: (path) =>
      mock.files[path] !== undefined || mock.directories.has(path),
    getLastModified: (path) => mock.modified[path] ?? null,
    readdir: (path) => {
      const prefix = path.replace(/\/+$/, "");
      const entries = new Set<string>();
      for (const filePath of Object.keys(mock.files)) {
        if (filePath.startsWith(`${prefix}/`)) {
          entries.add(filePath.slice(prefix.length + 1).split("/")[0] ?? "");
        }
      }
      for (const directory of mock.directories) {
        if (directory.startsWith(`${prefix}/`)) {
          entries.add(directory.slice(prefix.length + 1).split("/")[0] ?? "");
        }
      }
      return [...entries].filter(Boolean).sort();
    },
    isDirectory: (path) => mock.directories.has(path.replace(/\/+$/, "")),
  };
}

function addFile(mock: MockFs, path: string, content: string, modified: string): void {
  const parts = path.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    mock.directories.add(parts.slice(0, index).join("/"));
  }
  mock.files[path] = content;
  mock.modified[path] = modified;
}

function createCandidateDocument(): string {
  return JSON.stringify({
    generatedAt: "2026-07-03T18:00:00.000Z",
    candidates: [
      {
        candidateId: "hyp-z",
        hypothesis: "Late-window overconfidence fade",
        confidence: "medium",
        warnings: ["Low sample in one regime."],
        suggestedStrategyFamily: "calibration-no-fade",
      },
      {
        candidateId: "hyp-a",
        hypothesis: "Early-window underpricing buy",
        confidence: "high",
        warnings: [],
        suggestedStrategyFamily: "calibration-yes-buy",
      },
    ],
  });
}

function createValidationDocument(): string {
  return JSON.stringify({
    generatedAt: "2026-07-03T18:30:00.000Z",
    validations: [
      {
        hypothesisId: "hyp-a",
        hypothesis: "Early-window underpricing buy",
        robustnessScore: 84,
        passes: true,
        reasons: ["Robustness score 84 meets promotion threshold."],
      },
      {
        hypothesisId: "hyp-z",
        hypothesis: "Late-window overconfidence fade",
        robustnessScore: 41,
        passes: false,
        reasons: ["Robustness score 41 is below promotion threshold (70)."],
      },
    ],
  });
}

function createSynthesisDocument(): string {
  return JSON.stringify({
    generatedAt: "2026-07-03T19:00:00.000Z",
    strategies: [
      {
        strategyId: "synth-hyp-a",
        hypothesisId: "hyp-a",
        strategyFamily: "calibration-fade",
        promotionStatus: "candidate",
        validationSummary: { robustnessScore: 84, passes: true },
        riskNotes: [],
      },
      {
        strategyId: "synth-hyp-z",
        hypothesisId: "hyp-z",
        strategyFamily: "calibration-fade",
        promotionStatus: "rejected",
        validationSummary: { robustnessScore: 41, passes: false },
        riskNotes: ["Validation failed before synthesis."],
      },
    ],
  });
}

function createHarnessSummary(): string {
  return JSON.stringify({
    completedAt: "2026-07-03T19:30:00.000Z",
    results: [
      {
        synthesizedStrategyId: "synth-hyp-a",
        hypothesisId: "hyp-a",
        status: "success",
        errorMessage: null,
      },
    ],
  });
}

function buildHealthyInputs(mock: MockFs): ParsedHypothesisLifecycleInputs {
  addFile(
    mock,
    DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.hypothesisCandidatesPath,
    createCandidateDocument(),
    "2026-07-03T18:00:00.000Z",
  );
  addFile(
    mock,
    DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.evidenceHtmlPath,
    "<html></html>",
    "2026-07-03T18:10:00.000Z",
  );
  addFile(
    mock,
    DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.hypothesisValidationPath,
    createValidationDocument(),
    "2026-07-03T18:30:00.000Z",
  );
  addFile(
    mock,
    DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.strategySynthesisPath,
    createSynthesisDocument(),
    "2026-07-03T19:00:00.000Z",
  );
  addFile(
    mock,
    DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.strategyHarnessSummaryPath,
    createHarnessSummary(),
    "2026-07-03T19:30:00.000Z",
  );

  return loadHypothesisLifecycleInputs(createIo(mock), DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS);
}

describe("buildHypothesisLifecycleReport", () => {
  it("reports an empty dashboard when no candidates exist", () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]), modified: {} };
    const inputs = loadHypothesisLifecycleInputs(createIo(mock), DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS);
    const report = buildHypothesisLifecycleReportFromInputs(
      GENERATED_AT,
      DEFAULT_HYPOTHESIS_LIFECYCLE_HTML_PATH,
      DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS,
      inputs,
    );

    expect(report.entries).toEqual([]);
    expect(report.summary.totalHypotheses).toBe(0);
    expect(serializeHypothesisLifecycleHtml(report)).toContain("No hypotheses found");
  });

  it("builds a healthy full pipeline dashboard with deterministic ordering", () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]), modified: {} };
    const inputs = buildHealthyInputs(mock);
    const report = buildHypothesisLifecycleReportFromInputs(
      GENERATED_AT,
      DEFAULT_HYPOTHESIS_LIFECYCLE_HTML_PATH,
      DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS,
      inputs,
    );

    expect(report.entries.map((entry) => entry.hypothesisId)).toEqual(["hyp-a", "hyp-z"]);
    expect(report.entries[0]?.status).toBe("promoted");
    expect(report.entries[0]?.linkedStrategyId).toBe("synth-hyp-a");
    expect(report.entries[1]?.status).toBe("rejected");
    expect(report.summary.promotedCount).toBe(1);
    expect(report.summary.rejectedCount).toBe(1);
  });

  it("marks missing validation as pending", () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]), modified: {} };
    addFile(
      mock,
      DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.hypothesisCandidatesPath,
      createCandidateDocument(),
      "2026-07-03T18:00:00.000Z",
    );

    const inputs = loadHypothesisLifecycleInputs(createIo(mock), DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS);
    const report = buildHypothesisLifecycleReportFromInputs(
      GENERATED_AT,
      DEFAULT_HYPOTHESIS_LIFECYCLE_HTML_PATH,
      DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS,
      inputs,
    );

    expect(report.summary.missingValidationCount).toBe(2);
    expect(report.entries.every((entry) => entry.validationOutcome === "pending")).toBe(true);
  });

  it("rejects hypotheses that fail robustness validation", () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]), modified: {} };
    addFile(
      mock,
      DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.hypothesisCandidatesPath,
      createCandidateDocument(),
      "2026-07-03T18:00:00.000Z",
    );
    addFile(
      mock,
      DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.hypothesisValidationPath,
      createValidationDocument(),
      "2026-07-03T18:30:00.000Z",
    );

    const report = buildHypothesisLifecycleReportFromInputs(
      GENERATED_AT,
      DEFAULT_HYPOTHESIS_LIFECYCLE_HTML_PATH,
      DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS,
      loadHypothesisLifecycleInputs(createIo(mock), DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS),
    );

    const rejected = report.entries.find((entry) => entry.hypothesisId === "hyp-z");
    expect(rejected?.validationOutcome).toBe("failed");
    expect(rejected?.promotionDecision).toBe("rejected");
    expect(rejected?.status).toBe("rejected");
  });

  it("shows synthesized strategies that have not been backtested yet", () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]), modified: {} };
    addFile(
      mock,
      DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.hypothesisCandidatesPath,
      createCandidateDocument(),
      "2026-07-03T18:00:00.000Z",
    );
    addFile(
      mock,
      DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.hypothesisValidationPath,
      createValidationDocument(),
      "2026-07-03T18:30:00.000Z",
    );
    addFile(
      mock,
      DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS.strategySynthesisPath,
      createSynthesisDocument(),
      "2026-07-03T19:00:00.000Z",
    );

    const promoted = buildHypothesisLifecycleReportFromInputs(
      GENERATED_AT,
      DEFAULT_HYPOTHESIS_LIFECYCLE_HTML_PATH,
      DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS,
      loadHypothesisLifecycleInputs(createIo(mock), DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS),
    ).entries.find((entry) => entry.hypothesisId === "hyp-a");

    expect(promoted?.status).toBe("synthesized");
    expect(promoted?.stages.find((stage) => stage.stageId === "backtested")?.status).toBe("partial");
  });

  it("serializes HTML with pipeline stage labels", () => {
    const mock: MockFs = { files: {}, directories: new Set(["data"]), modified: {} };
    const report = buildHypothesisLifecycleReportFromInputs(
      GENERATED_AT,
      DEFAULT_HYPOTHESIS_LIFECYCLE_HTML_PATH,
      DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS,
      buildHealthyInputs(mock),
    );
    const html = serializeHypothesisLifecycleHtml(report);

    expect(html).toContain("Hypothesis Lifecycle Dashboard");
    expect(html).toContain("Evidence Report");
    expect(html).toContain("Promoted / Rejected");
    expect(html).toContain("hyp-a");
  });
});
