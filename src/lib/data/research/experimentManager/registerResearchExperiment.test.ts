import { describe, expect, it } from "vitest";

import { buildExperimentRecord } from "./buildExperimentRecord";
import { compareExperimentPair } from "./compareExperiments";
import { buildResearchExperimentId } from "./generateExperimentId";
import { loadExperimentInputs } from "./loadExperimentInputs";
import {
  registerResearchExperiment,
  ResearchExperimentManagerError,
  type ResearchExperimentInputPaths,
  type ResearchExperimentManagerIo,
} from "./index";

const GENERATED_AT = "2026-07-04T02:00:00.000Z";
const INPUT_PATHS: ResearchExperimentInputPaths = {
  pipelineSummaryPath: "pipeline-summary.json",
  fullResearchSummaryPath: "full-research-summary.json",
  hypothesisCandidatesPath: "hypothesis-candidates.json",
  hypothesisValidationPath: "hypothesis-validation.json",
  strategySynthesisPath: "strategy-synthesis-candidates.json",
  harnessResultsPath: "harness-results.json",
  candidatePromotionsPath: "candidate-promotions.json",
  artifactIndexPath: "research-artifact-index.json",
};

const hypothesisCandidates = {
  summary: { candidateCount: 2 },
};

const hypothesisValidation = {
  summary: {
    totalHypotheses: 2,
    passingCount: 1,
    failingCount: 1,
    averageRobustnessScore: 55,
  },
};

const strategySynthesis = {
  summary: { synthesizedCount: 2 },
};

const harnessResults = {
  summary: {
    totalStrategies: 2,
    evaluatedCount: 1,
    recommendationCounts: { candidate: 1, reject: 1 },
  },
};

const candidatePromotions = {
  summary: {
    totalStrategies: 2,
    decisionCounts: { candidate: 1, rejected: 1 },
    watchlistCount: 0,
    rejectedCount: 1,
  },
  promotions: [
    {
      strategyId: "synth-a",
      hypothesisId: "hyp-a",
      strategyFamily: "calibration-fade",
      decision: "candidate",
      supportingMetrics: { robustnessScore: 88 },
      warnings: [],
    },
    {
      strategyId: "synth-b",
      hypothesisId: "hyp-b",
      strategyFamily: "calibration-fade",
      decision: "rejected",
      supportingMetrics: { robustnessScore: 31 },
      warnings: ["low robustness"],
    },
  ],
};

const artifactIndex = {
  artifacts: [
    { artifactId: "hypothesis-candidates", status: "present" },
    { artifactId: "hypothesis-validation", status: "stale" },
  ],
};

function createIo(
  files: Record<string, string>,
  options?: { existingRecordPaths?: readonly string[] },
): ResearchExperimentManagerIo & { written: Map<string, string> } {
  const written = new Map<string, string>();
  const existingRecordPaths = new Set(options?.existingRecordPaths ?? []);

  return {
    written,
    readFile: (path) => files[path] ?? written.get(path) ?? "",
    writeFile: (path, data) => {
      written.set(path, data);
    },
    fileExists: (path) =>
      existingRecordPaths.has(path) || path in files || written.has(path),
    resolveGitCommit: () => "abc123def456",
  };
}

describe("buildResearchExperimentId", () => {
  it("builds deterministic ids from timestamp and git commit", () => {
    expect(buildResearchExperimentId(GENERATED_AT, "abc123")).toMatch(/^rex-v1-/);
    expect(buildResearchExperimentId(GENERATED_AT, "abc123")).toBe(
      buildResearchExperimentId(GENERATED_AT, "abc123"),
    );
  });
});

describe("loadExperimentInputs", () => {
  it("loads summaries and gracefully handles missing files", () => {
    const io = createIo({
      [INPUT_PATHS.hypothesisCandidatesPath]: JSON.stringify(hypothesisCandidates),
      [INPUT_PATHS.hypothesisValidationPath]: JSON.stringify(hypothesisValidation),
      [INPUT_PATHS.strategySynthesisPath]: JSON.stringify(strategySynthesis),
      [INPUT_PATHS.harnessResultsPath]: JSON.stringify(harnessResults),
      [INPUT_PATHS.candidatePromotionsPath]: JSON.stringify(candidatePromotions),
      [INPUT_PATHS.artifactIndexPath]: JSON.stringify(artifactIndex),
    });

    const inputs = loadExperimentInputs(io, INPUT_PATHS);

    expect(inputs.hypothesisCount).toBe(2);
    expect(inputs.validationSummary?.averageRobustnessScore).toBe(55);
    expect(inputs.synthesizedStrategyCount).toBe(2);
    expect(inputs.promotions).toHaveLength(2);
    expect(inputs.artifactSnapshot).toHaveLength(2);
    expect(inputs.pipelineSummary).toBeNull();
  });
});

describe("buildExperimentRecord", () => {
  it("selects the highest-ranked promotion as top candidate", () => {
    const io = createIo({
      [INPUT_PATHS.candidatePromotionsPath]: JSON.stringify(candidatePromotions),
    });
    const inputs = loadExperimentInputs(io, INPUT_PATHS);
    const record = buildExperimentRecord(
      {
        generatedAt: GENERATED_AT,
        inputPaths: INPUT_PATHS,
        experimentsDir: "data/research-results/experiments",
        indexOutputPath: "data/research-results/experiment-index.json",
        htmlOutputPath: "data/reports/research-experiments.html",
        io,
      },
      inputs,
    );

    expect(record.topCandidate?.strategyId).toBe("synth-a");
    expect(record.promotionSnapshot).toHaveLength(2);
    expect(record.gitCommit).toBe("abc123def456");
  });
});

describe("compareExperimentPair", () => {
  it("computes hypothesis, robustness, promotion, and artifact deltas", () => {
    const baseline = buildExperimentRecord(
      {
        generatedAt: "2026-07-03T02:00:00.000Z",
        inputPaths: INPUT_PATHS,
        experimentsDir: "data/research-results/experiments",
        indexOutputPath: "data/research-results/experiment-index.json",
        htmlOutputPath: "data/reports/research-experiments.html",
        gitCommit: "baseline",
        io: createIo({}),
      },
      loadExperimentInputs(
        createIo({
          [INPUT_PATHS.hypothesisCandidatesPath]: JSON.stringify({ summary: { candidateCount: 1 } }),
          [INPUT_PATHS.hypothesisValidationPath]: JSON.stringify({
            summary: {
              totalHypotheses: 1,
              passingCount: 0,
              failingCount: 1,
              averageRobustnessScore: 40,
            },
          }),
          [INPUT_PATHS.candidatePromotionsPath]: JSON.stringify({
            summary: {
              totalStrategies: 1,
              decisionCounts: { rejected: 1 },
              watchlistCount: 0,
              rejectedCount: 1,
            },
            promotions: [
              {
                strategyId: "synth-b",
                hypothesisId: "hyp-b",
                strategyFamily: "calibration-fade",
                decision: "rejected",
                supportingMetrics: { robustnessScore: 31 },
                warnings: [],
              },
            ],
          }),
          [INPUT_PATHS.artifactIndexPath]: JSON.stringify({
            artifacts: [{ artifactId: "hypothesis-validation", status: "missing" }],
          }),
        }),
        INPUT_PATHS,
      ),
    );

    const compare = buildExperimentRecord(
      {
        generatedAt: GENERATED_AT,
        inputPaths: INPUT_PATHS,
        experimentsDir: "data/research-results/experiments",
        indexOutputPath: "data/research-results/experiment-index.json",
        htmlOutputPath: "data/reports/research-experiments.html",
        gitCommit: "compare",
        io: createIo({
          [INPUT_PATHS.hypothesisCandidatesPath]: JSON.stringify(hypothesisCandidates),
          [INPUT_PATHS.hypothesisValidationPath]: JSON.stringify(hypothesisValidation),
          [INPUT_PATHS.candidatePromotionsPath]: JSON.stringify(candidatePromotions),
          [INPUT_PATHS.artifactIndexPath]: JSON.stringify(artifactIndex),
        }),
      },
      loadExperimentInputs(
        createIo({
          [INPUT_PATHS.hypothesisCandidatesPath]: JSON.stringify(hypothesisCandidates),
          [INPUT_PATHS.hypothesisValidationPath]: JSON.stringify(hypothesisValidation),
          [INPUT_PATHS.candidatePromotionsPath]: JSON.stringify(candidatePromotions),
          [INPUT_PATHS.artifactIndexPath]: JSON.stringify(artifactIndex),
        }),
        INPUT_PATHS,
      ),
    );

    const comparison = compareExperimentPair(baseline, compare);

    expect(comparison.hypothesisCountDelta).toBe(1);
    expect(comparison.averageRobustnessDelta).toBe(15);
    expect(comparison.promotionChanges.some((change) => change.strategyId === "synth-a")).toBe(
      true,
    );
    expect(comparison.candidateChanges.added).toContain("synth-a");
    expect(comparison.artifactChanges).toEqual([
      {
        artifactId: "hypothesis-candidates",
        previousStatus: null,
        currentStatus: "present",
      },
      {
        artifactId: "hypothesis-validation",
        previousStatus: "missing",
        currentStatus: "stale",
      },
    ]);
  });
});

describe("registerResearchExperiment", () => {
  it("appends to the index and compares against the previous experiment", () => {
    const previousRecordPath =
      "data/research-results/experiments/rex-v1-previous/experiment.json";
    const previousRecord = {
      experimentId: "rex-v1-previous",
      timestamp: "2026-07-03T02:00:00.000Z",
      gitCommit: "old",
      pipelineConfiguration: { pipeline: null, fullResearch: null },
      hypothesisCount: 1,
      validationSummary: {
        totalHypotheses: 1,
        passingCount: 0,
        failingCount: 1,
        averageRobustnessScore: 40,
      },
      synthesizedStrategyCount: 1,
      harnessSummary: null,
      candidatePromotionSummary: null,
      promotionSnapshot: [],
      topCandidate: null,
      warnings: [],
      runtime: {
        pipelineDurationMs: null,
        fullResearchDurationMs: null,
        totalDurationMs: null,
      },
      artifactSnapshot: [],
      inputPaths: INPUT_PATHS,
      recordPath: previousRecordPath,
    };

    const io = createIo({
      [INPUT_PATHS.hypothesisCandidatesPath]: JSON.stringify(hypothesisCandidates),
      [INPUT_PATHS.hypothesisValidationPath]: JSON.stringify(hypothesisValidation),
      [INPUT_PATHS.candidatePromotionsPath]: JSON.stringify(candidatePromotions),
      [previousRecordPath]: JSON.stringify(previousRecord),
      "data/research-results/experiment-index.json": JSON.stringify({
        generatedAt: "2026-07-03T02:00:00.000Z",
        outputPath: "data/research-results/experiment-index.json",
        htmlOutputPath: "data/reports/research-experiments.html",
        latestExperimentId: "rex-v1-previous",
        experiments: [
          {
            experimentId: "rex-v1-previous",
            timestamp: "2026-07-03T02:00:00.000Z",
            recordPath: previousRecordPath,
            present: true,
          },
        ],
        latestComparison: null,
      }),
    });

    const result = registerResearchExperiment({
      generatedAt: GENERATED_AT,
      inputPaths: INPUT_PATHS,
      experimentsDir: "data/research-results/experiments",
      indexOutputPath: "data/research-results/experiment-index.json",
      htmlOutputPath: "data/reports/research-experiments.html",
      gitCommit: "newcommit",
      io,
    });

    expect(result.index.experiments).toHaveLength(2);
    expect(result.index.latestExperimentId).toBe(result.record.experimentId);
    expect(result.index.latestComparison?.hypothesisCountDelta).toBe(1);
  });

  it("rejects overwriting an existing experiment record", () => {
    const io = createIo({
      [INPUT_PATHS.hypothesisCandidatesPath]: JSON.stringify(hypothesisCandidates),
      [INPUT_PATHS.hypothesisValidationPath]: JSON.stringify(hypothesisValidation),
    });

    const first = registerResearchExperiment({
      generatedAt: GENERATED_AT,
      inputPaths: INPUT_PATHS,
      experimentsDir: "data/research-results/experiments",
      indexOutputPath: "data/research-results/experiment-index.json",
      htmlOutputPath: "data/reports/research-experiments.html",
      gitCommit: "abc123",
      io,
    });

    io.writeFile(first.record.recordPath, JSON.stringify(first.record));

    expect(() =>
      registerResearchExperiment({
        generatedAt: GENERATED_AT,
        inputPaths: INPUT_PATHS,
        experimentsDir: "data/research-results/experiments",
        indexOutputPath: "data/research-results/experiment-index.json",
        htmlOutputPath: "data/reports/research-experiments.html",
        gitCommit: "abc123",
        io,
      }),
    ).toThrow(ResearchExperimentManagerError);
  });
});
