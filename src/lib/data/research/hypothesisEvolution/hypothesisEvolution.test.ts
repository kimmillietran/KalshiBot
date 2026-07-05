import { describe, expect, it } from "vitest";

import { analyzeHypothesisEvolution } from "./analyzeHypothesisEvolution";
import { buildHypothesisEvolutionRun } from "./buildHypothesisEvolutionRun";
import { buildHypothesisEvolutionReport } from "./buildHypothesisEvolutionReport";
import {
  appendHypothesisHistoryRun,
  pruneHypothesisHistoryRuns,
  serializeHypothesisHistoryDocument,
} from "./hypothesisHistoryDocument";
import type {
  HypothesisEvolutionRunSnapshot,
  HypothesisHistoryDocument,
  HypothesisHistoryRun,
} from "./hypothesisEvolutionTypes";
import { DEFAULT_HYPOTHESIS_HISTORY_MAX_RUNS } from "./hypothesisEvolutionTypes";
import { serializeHypothesisEvolutionHtml } from "./serializeHypothesisEvolutionHtml";

const HISTORY_PATH = "data/research-results/hypothesis-history.json";
const HTML_PATH = "data/reports/hypothesis-evolution.html";

function createSnapshot(input: {
  timestamp: string;
  hypothesisId: string;
  hypothesis: string;
  observationCount: number;
  robustnessScore: number;
  marketCount?: number;
  classification?: HypothesisEvolutionRunSnapshot["classification"];
}): HypothesisEvolutionRunSnapshot {
  return {
    timestamp: input.timestamp,
    hypothesis: input.hypothesis,
    marketCount: input.marketCount ?? 100,
    observationCount: input.observationCount,
    robustnessScore: input.robustnessScore,
    calibrationError: 0.12,
    confidence: "medium",
    monthCount: 3,
    uniqueTradingDays: 20,
    regimesWithData: 4,
    regimesWithEdge: 2,
    monthPersistenceRate: 0.5,
    leaveOneMonthOutStdDev: 0.08,
    classification: input.classification ?? "promising-needs-more-history",
    passes: input.robustnessScore >= 60,
    promotionEligible: input.robustnessScore >= 70,
    candidateRank: 1,
  };
}

function createRun(
  runId: string,
  snapshots: Record<string, HypothesisEvolutionRunSnapshot>,
): HypothesisHistoryRun {
  return {
    runId,
    marketCount: 100,
    snapshotsByHypothesisId: snapshots,
  };
}

function createHistory(runs: HypothesisHistoryRun[]): HypothesisHistoryDocument {
  return {
    generatedAt: "2026-07-05T12:00:00.000Z",
    outputPath: HISTORY_PATH,
    htmlOutputPath: HTML_PATH,
    maxRunsRetained: DEFAULT_HYPOTHESIS_HISTORY_MAX_RUNS,
    runs,
  };
}

function createValidationFixture(input: {
  hypothesisId: string;
  hypothesis: string;
  observationCount: number;
  robustnessScore: number;
  generatedAt: string;
}) {
  return {
    generatedAt: input.generatedAt,
    validations: [
      {
        hypothesisId: input.hypothesisId,
        hypothesis: input.hypothesis,
        robustnessScore: input.robustnessScore,
        passes: input.robustnessScore >= 60,
        observationCount: input.observationCount,
        timeStability: {
          monthPeriods: [
            { observations: 50 },
            { observations: 60 },
            { observations: 40 },
          ],
          monthPersistenceRate: 0.66,
        },
        regimeStability: {
          regimesWithData: 4,
          regimesWithEdge: 2,
        },
        sampleConcentration: {
          uniqueTradingDays: 22,
        },
        leaveOnePeriodOut: {
          errorStdDev: 0.07,
        },
      },
    ],
  };
}

describe("hypothesisHistoryDocument", () => {
  it("creates history on first run", () => {
    const run = createRun("2026-07-05T10:00:00.000Z", {
      "hyp-a": createSnapshot({
        timestamp: "2026-07-05T10:00:00.000Z",
        hypothesisId: "hyp-a",
        hypothesis: "Medium vol × 30-70%",
        observationCount: 170,
        robustnessScore: 49,
      }),
    });

    const history = appendHypothesisHistoryRun(null, run, {
      generatedAt: "2026-07-05T10:00:00.000Z",
      outputPath: HISTORY_PATH,
      htmlOutputPath: HTML_PATH,
    });

    expect(history.runs).toHaveLength(1);
    expect(history.runs[0]?.runId).toBe("2026-07-05T10:00:00.000Z");
    expect(serializeHypothesisHistoryDocument(history)).toContain("hyp-a");
  });

  it("appends runs without overwriting prior history", () => {
    const first = createRun("2026-07-05T10:00:00.000Z", {
      "hyp-a": createSnapshot({
        timestamp: "2026-07-05T10:00:00.000Z",
        hypothesisId: "hyp-a",
        hypothesis: "Hypothesis A",
        observationCount: 170,
        robustnessScore: 49,
      }),
    });
    const second = createRun("2026-07-05T11:00:00.000Z", {
      "hyp-a": createSnapshot({
        timestamp: "2026-07-05T11:00:00.000Z",
        hypothesisId: "hyp-a",
        hypothesis: "Hypothesis A",
        observationCount: 484,
        robustnessScore: 58,
      }),
    });

    const history = appendHypothesisHistoryRun(
      appendHypothesisHistoryRun(null, first, {
        generatedAt: "2026-07-05T10:00:00.000Z",
        outputPath: HISTORY_PATH,
        htmlOutputPath: HTML_PATH,
      }),
      second,
      {
        generatedAt: "2026-07-05T11:00:00.000Z",
        outputPath: HISTORY_PATH,
        htmlOutputPath: HTML_PATH,
      },
    );

    expect(history.runs).toHaveLength(2);
    expect(history.runs[0]?.snapshotsByHypothesisId["hyp-a"]?.observationCount).toBe(170);
    expect(history.runs[1]?.snapshotsByHypothesisId["hyp-a"]?.observationCount).toBe(484);
  });

  it("prunes history to the latest 100 runs", () => {
    let history: HypothesisHistoryDocument | null = null;

    for (let index = 0; index < 105; index += 1) {
      const run = createRun(`2026-07-05T${String(index).padStart(2, "0")}:00:00.000Z`, {
        "hyp-a": createSnapshot({
          timestamp: `2026-07-05T${String(index).padStart(2, "0")}:00:00.000Z`,
          hypothesisId: "hyp-a",
          hypothesis: "Hypothesis A",
          observationCount: 100 + index,
          robustnessScore: 50,
        }),
      });

      history = appendHypothesisHistoryRun(history, run, {
        generatedAt: run.runId,
        outputPath: HISTORY_PATH,
        htmlOutputPath: HTML_PATH,
      });
    }

    const pruned = pruneHypothesisHistoryRuns(history!);
    expect(pruned.runs).toHaveLength(100);
    expect(pruned.runs[0]?.runId).toBe("2026-07-05T05:00:00.000Z");
    expect(pruned.runs[99]?.runId).toBe("2026-07-05T104:00:00.000Z");
  });
});

describe("analyzeHypothesisEvolution", () => {
  it("classifies strengthening hypotheses across multiple runs", () => {
    const history = createHistory([
      createRun("run-1", {
        "hyp-a": createSnapshot({
          timestamp: "2026-07-01T10:00:00.000Z",
          hypothesisId: "hyp-a",
          hypothesis: "Medium vol × 30-70%",
          observationCount: 170,
          robustnessScore: 49,
        }),
      }),
      createRun("run-2", {
        "hyp-a": createSnapshot({
          timestamp: "2026-07-02T10:00:00.000Z",
          hypothesisId: "hyp-a",
          hypothesis: "Medium vol × 30-70%",
          observationCount: 1800,
          robustnessScore: 73,
        }),
      }),
    ]);

    const analysis = analyzeHypothesisEvolution(history);
    const entry = analysis.entries.find((item) => item.hypothesisId === "hyp-a");

    expect(entry?.trend).toBe("strengthening");
    expect(entry?.trendMetrics.robustnessDelta).toBe(24);
    expect(entry?.trendMetrics.observationGrowth).toBe(1630);
  });

  it("classifies weakening hypotheses", () => {
    const history = createHistory([
      createRun("run-1", {
        "hyp-b": createSnapshot({
          timestamp: "2026-07-01T10:00:00.000Z",
          hypothesisId: "hyp-b",
          hypothesis: "High vol fade",
          observationCount: 900,
          robustnessScore: 72,
          classification: "robust-enough-to-test",
        }),
      }),
      createRun("run-2", {
        "hyp-b": createSnapshot({
          timestamp: "2026-07-02T10:00:00.000Z",
          hypothesisId: "hyp-b",
          hypothesis: "High vol fade",
          observationCount: 950,
          robustnessScore: 60,
          classification: "promising-needs-more-history",
        }),
      }),
    ]);

    const entry = analyzeHypothesisEvolution(history).entries.find(
      (item) => item.hypothesisId === "hyp-b",
    );

    expect(entry?.trend).toBe("weakening");
  });

  it("classifies stable hypotheses", () => {
    const history = createHistory([
      createRun("run-1", {
        "hyp-c": createSnapshot({
          timestamp: "2026-07-01T10:00:00.000Z",
          hypothesisId: "hyp-c",
          hypothesis: "Stable edge",
          observationCount: 500,
          robustnessScore: 62,
        }),
      }),
      createRun("run-2", {
        "hyp-c": createSnapshot({
          timestamp: "2026-07-02T10:00:00.000Z",
          hypothesisId: "hyp-c",
          hypothesis: "Stable edge",
          observationCount: 500,
          robustnessScore: 63,
        }),
      }),
    ]);

    const entry = analyzeHypothesisEvolution(history).entries.find(
      (item) => item.hypothesisId === "hyp-c",
    );

    expect(entry?.trend).toBe("stable");
  });

  it("detects disappeared hypotheses", () => {
    const history = createHistory([
      createRun("run-1", {
        "hyp-old": createSnapshot({
          timestamp: "2026-07-01T10:00:00.000Z",
          hypothesisId: "hyp-old",
          hypothesis: "Retired hypothesis",
          observationCount: 300,
          robustnessScore: 55,
        }),
      }),
      createRun("run-2", {
        "hyp-new": createSnapshot({
          timestamp: "2026-07-02T10:00:00.000Z",
          hypothesisId: "hyp-new",
          hypothesis: "Current hypothesis",
          observationCount: 450,
          robustnessScore: 66,
        }),
      }),
    ]);

    const analysis = analyzeHypothesisEvolution(history);
    const disappeared = analysis.entries.find((item) => item.hypothesisId === "hyp-old");
    const newlyDiscovered = analysis.entries.find((item) => item.hypothesisId === "hyp-new");

    expect(disappeared?.trend).toBe("disappeared");
    expect(newlyDiscovered?.trend).toBe("newly-discovered");
    expect(analysis.summary.disappearedCount).toBe(1);
  });
});

describe("buildHypothesisEvolutionReport", () => {
  it("builds report and serialized HTML from research artifacts", () => {
    const generatedAt = "2026-07-05T12:00:00.000Z";
    const candidates = JSON.stringify({
      generatedAt,
      candidates: [
        {
          candidateId: "hyp-a",
          hypothesis: "Medium vol × 30-70%",
          confidence: "medium",
          bucketMetadata: { calibrationError: 0.1 },
        },
      ],
    });
    const validation = JSON.stringify(
      createValidationFixture({
        generatedAt,
        hypothesisId: "hyp-a",
        hypothesis: "Medium vol × 30-70%",
        observationCount: 170,
        robustnessScore: 49,
      }),
    );

    const { historyJson, report } = buildHypothesisEvolutionReport({
      generatedAt,
      outputPath: HISTORY_PATH,
      htmlOutputPath: HTML_PATH,
      historyPath: HISTORY_PATH,
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        coverageValidationPath: "data/research-results/coverage-aware-validation.json",
        mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
        historyPath: HISTORY_PATH,
      },
      io: {
        readFile: (path) => {
          if (path.endsWith("hypothesis-candidates.json")) {
            return candidates;
          }
          if (path.endsWith("hypothesis-validation.json")) {
            return validation;
          }
          return "{}";
        },
        fileExists: (path) =>
          path.endsWith("hypothesis-candidates.json")
          || path.endsWith("hypothesis-validation.json"),
      },
    });

    const html = serializeHypothesisEvolutionHtml(report);

    expect(JSON.parse(historyJson).runs).toHaveLength(1);
    expect(report.summary.runCount).toBe(1);
    expect(html).toContain("Hypothesis Evolution");
    expect(html).toContain("Medium vol");
    expect(html).toContain("Timeline");
  });
});

describe("buildHypothesisEvolutionRun", () => {
  it("builds ranked snapshots for the current validation run", () => {
    const run = buildHypothesisEvolutionRun({
      runTimestamp: "2026-07-05T12:00:00.000Z",
      marketCount: 250,
      candidates: [
        {
          candidateId: "hyp-a",
          hypothesis: "A",
          confidence: "medium",
          bucketMetadata: { calibrationError: 0.09 },
        } as never,
      ],
      validations: [
        {
          hypothesisId: "hyp-a",
          hypothesis: "A",
          robustnessScore: 72,
          passes: true,
          observationCount: 500,
          timeStability: {
            monthPeriods: [{ observations: 100 }, { observations: 0 }],
            monthPersistenceRate: 0.5,
          },
          regimeStability: { regimesWithData: 3, regimesWithEdge: 1 },
          sampleConcentration: { uniqueTradingDays: 15 },
          leaveOnePeriodOut: { errorStdDev: 0.05 },
        } as never,
        {
          hypothesisId: "hyp-b",
          hypothesis: "B",
          robustnessScore: 80,
          passes: true,
          observationCount: 600,
          timeStability: {
            monthPeriods: [{ observations: 200 }],
            monthPersistenceRate: 0.8,
          },
          regimeStability: { regimesWithData: 4, regimesWithEdge: 2 },
          sampleConcentration: { uniqueTradingDays: 20 },
          leaveOnePeriodOut: { errorStdDev: 0.04 },
        } as never,
      ],
      coverageEntries: [
        {
          hypothesisId: "hyp-b",
          classification: "robust-enough-to-test",
        } as never,
      ],
    });

    expect(run.snapshotsByHypothesisId["hyp-b"]?.candidateRank).toBe(1);
    expect(run.snapshotsByHypothesisId["hyp-a"]?.candidateRank).toBe(2);
    expect(run.snapshotsByHypothesisId["hyp-b"]?.promotionEligible).toBe(true);
    expect(run.snapshotsByHypothesisId["hyp-a"]?.monthCount).toBe(1);
  });
});
