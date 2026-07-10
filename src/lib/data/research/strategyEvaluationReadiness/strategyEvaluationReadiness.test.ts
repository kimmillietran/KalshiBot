import { describe, expect, it } from "vitest";

import { buildStrategyEvaluationReadinessReport } from "./buildStrategyEvaluationReadinessReport";
import { evaluateStrategyEvaluationReadiness } from "./evaluateStrategyEvaluationReadiness";
import {
  loadStrategyEvaluationInputs,
  readArtifactFreshness,
} from "./loadStrategyEvaluationInputs";
import { serializeStrategyEvaluationReadinessHtml } from "./serializeStrategyEvaluationReadinessHtml";
import {
  DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS,
  DEFAULT_STRATEGY_EVALUATION_READINESS_HTML_PATH,
  DEFAULT_STRATEGY_EVALUATION_READINESS_OUTPUT_PATH,
} from "./strategyEvaluationReadinessTypes";
import type {
  StrategyEvaluationInputPaths,
  StrategyEvaluationReadinessIo,
} from "./strategyEvaluationReadinessTypes";

const GENERATED_AT = "2026-07-10T20:00:00.000Z";
const OUTPUT_PATH = DEFAULT_STRATEGY_EVALUATION_READINESS_OUTPUT_PATH;
const HTML_PATH = DEFAULT_STRATEGY_EVALUATION_READINESS_HTML_PATH;

function buildMemoryIo(files: Record<string, string>): StrategyEvaluationReadinessIo {
  const normalizedFiles = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path.replace(/\\/g, "/"), content]),
  );
  const directories = new Set<string>();

  for (const path of Object.keys(normalizedFiles)) {
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/"));
    }
  }

  return {
    readFile: (path) => normalizedFiles[path.replace(/\\/g, "/")] ?? "",
    fileExists: (path) => {
      const normalized = path.replace(/\\/g, "/");
      return normalized in normalizedFiles || directories.has(normalized);
    },
    readdir: (path) => {
      const prefix = `${path.replace(/\\/g, "/").replace(/\/$/, "")}/`;
      const children = new Set<string>();
      for (const filePath of Object.keys(normalizedFiles)) {
        if (!filePath.startsWith(prefix)) {
          continue;
        }

        const remainder = filePath.slice(prefix.length);
        const child = remainder.split("/")[0];
        if (child) {
          children.add(child);
        }
      }

      return [...children];
    },
    isDirectory: (path) => directories.has(path.replace(/\\/g, "/")),
  };
}

function buildForwardCaptureArtifact(input: {
  totalDurationMinutes?: number;
  daysCovered?: number;
  marketCount?: number;
  topOfBookRecordCount?: number;
  generatedAt?: string;
}) {
  return JSON.stringify({
    generatedAt: input.generatedAt ?? GENERATED_AT,
    aggregates: {
      totalDurationMinutes: input.totalDurationMinutes ?? 0,
      daysCovered: input.daysCovered ?? 0,
      marketCount: input.marketCount ?? 0,
      topOfBookRecordCount: input.topOfBookRecordCount ?? 0,
      runCount: input.totalDurationMinutes && input.totalDurationMinutes > 0 ? 1 : 0,
      btcSpotCoverageShare: 0.5,
    },
  });
}

function buildStaticParityArtifact(input: {
  grossCandidates?: number;
  bufferAdjustedCandidates?: number;
  executableConfirmed?: number;
  generatedAt?: string;
}) {
  return JSON.stringify({
    generatedAt: input.generatedAt ?? GENERATED_AT,
    friction: {
      requireExecutableConfirmation: true,
    },
    summary: {
      requiresExecutableConfirmation: true,
    },
    metrics: {
      bidOnlyGrossCandidateCount: input.grossCandidates ?? 0,
      bidOnlyBufferAdjustedCandidateCount: input.bufferAdjustedCandidates ?? 0,
      executableConfirmedCandidateCount: input.executableConfirmed ?? 0,
      topOfBookRecordsScanned: 500,
    },
  });
}

function buildBidSizeAuditArtifact(input: {
  bidPairWithSizeCount: number;
  bidPairWithoutSizeCount: number;
  generatedAt?: string;
}) {
  const total = input.bidPairWithSizeCount + input.bidPairWithoutSizeCount;
  return JSON.stringify({
    generatedAt: input.generatedAt ?? GENERATED_AT,
    comparison: {
      bidPairWithSizeCount: input.bidPairWithSizeCount,
      bidPairWithoutSizeCount: input.bidPairWithoutSizeCount,
      bidSizeCoverageShare: total > 0 ? input.bidPairWithSizeCount / total : 0,
      topOfBookBidSizeCoverageShare: 0.99,
    },
  });
}

function buildLifecycleArtifact(input: {
  episodeCount: number;
  bufferAdjustedEpisodeCount?: number;
  totalEpisodeDurationMs?: number;
  settlementJoined?: number;
  settlementCoverageShare?: number;
  generatedAt?: string;
}) {
  return JSON.stringify({
    generatedAt: input.generatedAt ?? GENERATED_AT,
    metrics: {
      episodeCount: input.episodeCount,
      bufferAdjustedEpisodeCount: input.bufferAdjustedEpisodeCount ?? 0,
      totalEpisodeDurationMs: input.totalEpisodeDurationMs ?? 60_000,
    },
    settlementJoin: input.settlementJoined
      ? {
          joinedEpisodeCount: input.settlementJoined,
          coverageShare: input.settlementCoverageShare ?? 1,
        }
      : undefined,
  });
}

function buildInputPaths(overrides?: Partial<StrategyEvaluationInputPaths>): StrategyEvaluationInputPaths {
  return {
    ...DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS,
    ...overrides,
    artifacts: {
      ...DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts,
      ...overrides?.artifacts,
    },
  };
}

function evaluateWithArtifacts(files: Record<string, string>) {
  const io = buildMemoryIo(files);
  const inputPaths = buildInputPaths();

  const loaded = loadStrategyEvaluationInputs({
    io,
    inputPaths,
    evaluatedAt: GENERATED_AT,
  });

  return evaluateStrategyEvaluationReadiness({
    inputs: loaded,
    inputPaths,
    evaluatedAt: GENERATED_AT,
    generatedAt: GENERATED_AT,
    outputPath: OUTPUT_PATH,
    htmlOutputPath: HTML_PATH,
  });
}

describe("strategyEvaluationReadiness", () => {
  it("returns not-ready-no-capture when no capture artifacts or runs exist", () => {
    const report = evaluateWithArtifacts({});

    expect(report.summary.overallVerdict).toBe("not-ready-no-capture");
    expect(report.summary.recommendedNextAction).toBe("run-longer-capture");
  });

  it("returns not-ready-too-short for short capture windows", () => {
    const report = evaluateWithArtifacts({
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.forwardCaptureReadiness]:
        buildForwardCaptureArtifact({
          totalDurationMinutes: 120,
          daysCovered: 1,
          marketCount: 8,
          topOfBookRecordCount: 400,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.bidSizeCoverageAudit]:
        buildBidSizeAuditArtifact({
          bidPairWithSizeCount: 200,
          bidPairWithoutSizeCount: 50,
        }),
    });

    expect(report.summary.overallVerdict).toBe("not-ready-too-short");
  });

  it("returns not-ready-size-coverage when bid-pair-with-size share is low", () => {
    const report = evaluateWithArtifacts({
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.forwardCaptureReadiness]:
        buildForwardCaptureArtifact({
          totalDurationMinutes: 8 * 60,
          daysCovered: 3,
          marketCount: 25,
          topOfBookRecordCount: 2_000,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.bidSizeCoverageAudit]:
        buildBidSizeAuditArtifact({
          bidPairWithSizeCount: 10,
          bidPairWithoutSizeCount: 90,
        }),
    });

    expect(report.summary.overallVerdict).toBe("not-ready-size-coverage");
    expect(report.summary.recommendedNextAction).toBe("merge-m12.8-and-recapture");
  });

  it("returns not-ready-no-candidates when parity scan has no candidates", () => {
    const report = evaluateWithArtifacts({
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.forwardCaptureReadiness]:
        buildForwardCaptureArtifact({
          totalDurationMinutes: 8 * 60,
          daysCovered: 3,
          marketCount: 25,
          topOfBookRecordCount: 2_000,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.bidSizeCoverageAudit]:
        buildBidSizeAuditArtifact({
          bidPairWithSizeCount: 80,
          bidPairWithoutSizeCount: 20,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.staticParityScan]:
        buildStaticParityArtifact({ grossCandidates: 0, bufferAdjustedCandidates: 0 }),
    });

    expect(report.summary.overallVerdict).toBe("not-ready-no-candidates");
  });

  it("returns not-ready-no-episodes when candidates exist but lifecycle episodes are missing", () => {
    const report = evaluateWithArtifacts({
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.forwardCaptureReadiness]:
        buildForwardCaptureArtifact({
          totalDurationMinutes: 8 * 60,
          daysCovered: 3,
          marketCount: 25,
          topOfBookRecordCount: 2_000,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.bidSizeCoverageAudit]:
        buildBidSizeAuditArtifact({
          bidPairWithSizeCount: 80,
          bidPairWithoutSizeCount: 20,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.staticParityScan]:
        buildStaticParityArtifact({ grossCandidates: 12, bufferAdjustedCandidates: 3 }),
    });

    expect(report.summary.overallVerdict).toBe("not-ready-no-episodes");
    expect(report.summary.recommendedNextAction).toBe("build-candidate-lifecycle");
  });

  it("returns not-ready-no-settlements when episodes exist without settlement joins", () => {
    const report = evaluateWithArtifacts({
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.forwardCaptureReadiness]:
        buildForwardCaptureArtifact({
          totalDurationMinutes: 8 * 60,
          daysCovered: 3,
          marketCount: 25,
          topOfBookRecordCount: 2_000,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.bidSizeCoverageAudit]:
        buildBidSizeAuditArtifact({
          bidPairWithSizeCount: 80,
          bidPairWithoutSizeCount: 20,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.staticParityScan]:
        buildStaticParityArtifact({ grossCandidates: 12, bufferAdjustedCandidates: 8 }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.bidOnlyCandidateLifecycle]:
        buildLifecycleArtifact({ episodeCount: 25, bufferAdjustedEpisodeCount: 8 }),
    });

    expect(report.summary.overallVerdict).toBe("not-ready-no-settlements");
    expect(report.summary.recommendedNextAction).toBe("join-settlements");
  });

  it("returns not-ready-no-executable-confirmation when settlements exist but confirmation is unsupported", () => {
    const report = evaluateWithArtifacts({
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.forwardCaptureReadiness]:
        buildForwardCaptureArtifact({
          totalDurationMinutes: 8 * 60,
          daysCovered: 3,
          marketCount: 25,
          topOfBookRecordCount: 2_000,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.bidSizeCoverageAudit]:
        buildBidSizeAuditArtifact({
          bidPairWithSizeCount: 80,
          bidPairWithoutSizeCount: 20,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.staticParityScan]:
        buildStaticParityArtifact({
          grossCandidates: 12,
          bufferAdjustedCandidates: 2,
          executableConfirmed: 0,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.bidOnlyCandidateLifecycle]:
        buildLifecycleArtifact({
          episodeCount: 25,
          bufferAdjustedEpisodeCount: 2,
          settlementJoined: 20,
        }),
    });

    expect(report.summary.overallVerdict).toBe("not-ready-no-executable-confirmation");
  });

  it("returns ready-for-descriptive-analysis when capture and candidates are sufficient", () => {
    const report = evaluateWithArtifacts({
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.forwardCaptureReadiness]:
        buildForwardCaptureArtifact({
          totalDurationMinutes: 8 * 60,
          daysCovered: 3,
          marketCount: 25,
          topOfBookRecordCount: 2_000,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.bidSizeCoverageAudit]:
        buildBidSizeAuditArtifact({
          bidPairWithSizeCount: 80,
          bidPairWithoutSizeCount: 20,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.staticParityScan]:
        buildStaticParityArtifact({
          grossCandidates: 12,
          bufferAdjustedCandidates: 2,
          executableConfirmed: 1,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.bidOnlyCandidateLifecycle]:
        buildLifecycleArtifact({
          episodeCount: 25,
          bufferAdjustedEpisodeCount: 2,
          settlementJoined: 20,
        }),
    });

    expect(report.summary.overallVerdict).toBe("ready-for-descriptive-analysis");
  });

  it("returns ready-for-offline-strategy-evaluation when full thresholds are met", () => {
    const report = evaluateWithArtifacts({
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.forwardCaptureReadiness]:
        buildForwardCaptureArtifact({
          totalDurationMinutes: 30 * 60,
          daysCovered: 5,
          marketCount: 30,
          topOfBookRecordCount: 8_000,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.bidSizeCoverageAudit]:
        buildBidSizeAuditArtifact({
          bidPairWithSizeCount: 400,
          bidPairWithoutSizeCount: 100,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.staticParityScan]:
        buildStaticParityArtifact({
          grossCandidates: 40,
          bufferAdjustedCandidates: 12,
          executableConfirmed: 3,
        }),
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.bidOnlyCandidateLifecycle]:
        buildLifecycleArtifact({
          episodeCount: 40,
          bufferAdjustedEpisodeCount: 12,
          settlementJoined: 35,
          settlementCoverageShare: 0.9,
        }),
    });

    expect(report.summary.overallVerdict).toBe("ready-for-offline-strategy-evaluation");
  });

  it("warns on missing artifacts without crashing", () => {
    const report = evaluateWithArtifacts({
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.forwardCaptureReadiness]:
        buildForwardCaptureArtifact({
          totalDurationMinutes: 30,
          daysCovered: 1,
          marketCount: 2,
          topOfBookRecordCount: 10,
        }),
    });

    expect(report.summary.missingArtifacts.length).toBeGreaterThan(0);
    expect(report.summary.warnings.some((warning) => warning.includes("Missing artifact"))).toBe(
      true,
    );
  });

  it("detects stale artifacts during freshness evaluation", () => {
    const io = buildMemoryIo({
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.forwardCaptureReadiness]:
        buildForwardCaptureArtifact({
          totalDurationMinutes: 30,
          daysCovered: 1,
          marketCount: 2,
          topOfBookRecordCount: 10,
          generatedAt: "2026-07-01T00:00:00.000Z",
        }),
    });

    const loaded = loadStrategyEvaluationInputs({
      io,
      inputPaths: buildInputPaths(),
      evaluatedAt: GENERATED_AT,
    });

    const freshness = readArtifactFreshness({
      inputs: loaded,
      evaluatedAt: GENERATED_AT,
      staleAfterHours: 72,
    });

    expect(freshness.status).toBe("stale");
    expect(freshness.staleArtifacts).toContain(
      DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.forwardCaptureReadiness,
    );
  });

  it("builds JSON and HTML reports through the builder", () => {
    const io = buildMemoryIo({
      [DEFAULT_STRATEGY_EVALUATION_INPUT_PATHS.artifacts.forwardCaptureReadiness]:
        buildForwardCaptureArtifact({
          totalDurationMinutes: 120,
          daysCovered: 2,
          marketCount: 25,
          topOfBookRecordCount: 1_000,
        }),
    });

    const report = buildStrategyEvaluationReadinessReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: buildInputPaths(),
      io,
    });

    const html = serializeStrategyEvaluationReadinessHtml(report);

    expect(report.dimensions.length).toBe(16);
    expect(html).toContain("Descriptive analysis ≠ strategy evaluation");
    expect(html).toContain(report.summary.overallVerdict);
  });
});
