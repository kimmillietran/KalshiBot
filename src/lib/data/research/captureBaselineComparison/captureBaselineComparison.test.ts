import { describe, expect, it } from "vitest";

import { compareCaptureBaselines } from "./compareCaptureBaselines";
import { buildCaptureBaselineComparisonReport } from "./buildCaptureBaselineComparisonReport";
import { createCaptureBaselineComparisonConfig } from "./captureBaselineComparisonConfig";
import type {
  CaptureBaselineComparisonIo,
  CaptureBaselineSnapshot,
} from "./captureBaselineComparisonTypes";
import {
  CaptureBaselineComparisonError,
  DEFAULT_CONFIGURED_BASELINE,
} from "./captureBaselineComparisonTypes";
import {
  buildBaselineSnapshot,
  buildComparisonSnapshot,
  loadCaptureBaselineComparisonInputs,
  resolveSelectedRun,
} from "./loadCaptureBaselineComparisonInputs";
import { serializeCaptureBaselineComparisonHtml } from "./serializeCaptureBaselineComparisonHtml";

const INPUT_DIR = "data/live-capture/forward-quotes";

function buildMemoryIo(files: Record<string, string>): CaptureBaselineComparisonIo {
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
        const child = filePath.slice(prefix.length).split("/")[0];
        if (child) {
          children.add(child);
        }
      }
      return [...children];
    },
    isDirectory: (path) => directories.has(path.replace(/\\/g, "/")),
  };
}

function topOfBookLine(input: {
  receivedAtLocal: string;
  yesBid?: number;
  noBid?: number;
  yesBidSize?: number | null;
  noBidSize?: number | null;
}): string {
  const yesBestBidSize = Object.hasOwn(input, "yesBidSize") ? input.yesBidSize : 10;
  const noBestBidSize = Object.hasOwn(input, "noBidSize") ? input.noBidSize : 10;

  return JSON.stringify({
    marketTicker: "KXBTC15M-TEST",
    receivedAtLocal: input.receivedAtLocal,
    bookState: "valid",
    yesBestBidCents: input.yesBid ?? 50,
    noBestBidCents: input.noBid ?? 50,
    yesBestBidSize,
    noBestBidSize,
  });
}

function artifact(path: string, body: Record<string, unknown>): Record<string, string> {
  return { [path]: JSON.stringify(body) };
}

function comparisonSnapshot(
  overrides: Partial<CaptureBaselineSnapshot>,
): CaptureBaselineSnapshot {
  return {
    label: "comparison",
    source: "research-artifacts",
    runId: null,
    captureDurationSeconds: null,
    marketCount: null,
    topOfBookCount: null,
    btcSpotCount: null,
    btcJoinCoverageShare: null,
    validBookShare: null,
    p90TopOfBookGapMs: null,
    bidPairWithSizeCount: null,
    bidPairWithoutSizeCount: null,
    bidSizeCoverageShare: null,
    validBidOnlySnapshots: null,
    grossCandidates: null,
    bufferAdjustedCandidates: null,
    candidateEpisodes: null,
    persistentCandidateEpisodes: null,
    strategyReadinessVerdict: null,
    executableConfirmationStatus: null,
    captureHealthVerdict: null,
    forwardCaptureReadinessVerdict: null,
    ...overrides,
  };
}

describe("captureBaselineComparison", () => {
  it("detects bid-size coverage improvement against configured baseline", () => {
    const result = compareCaptureBaselines({
      baseline: DEFAULT_CONFIGURED_BASELINE,
      comparison: comparisonSnapshot({
        bidSizeCoverageShare: 0.9,
        bidPairWithSizeCount: 90,
        bidPairWithoutSizeCount: 10,
        captureHealthVerdict: "capture-research-ready",
      }),
    });

    expect(result.overallVerdict).toBe("capture-quality-improved-need-volume");
    expect(result.improvements.some((item) => item.includes("bid size coverage"))).toBe(true);
  });

  it("detects capture health regression", () => {
    const result = compareCaptureBaselines({
      baseline: comparisonSnapshot({
        bidSizeCoverageShare: 0.9,
        validBookShare: 0.98,
        captureHealthVerdict: "capture-research-ready",
      }),
      comparison: comparisonSnapshot({
        bidSizeCoverageShare: 0.2,
        validBookShare: 0.5,
        captureHealthVerdict: "capture-gappy",
      }),
    });

    expect(result.overallVerdict).toBe("capture-quality-regressed");
    expect(result.regressions.length).toBeGreaterThan(0);
  });

  it("detects candidate count increase", () => {
    const result = compareCaptureBaselines({
      baseline: DEFAULT_CONFIGURED_BASELINE,
      comparison: comparisonSnapshot({
        grossCandidates: 3,
        bufferAdjustedCandidates: 2,
        candidateEpisodes: 4,
      }),
    });

    expect(result.overallVerdict).toBe("candidate-signal-emerging");
    expect(result.improvements.some((item) => item.includes("gross candidates"))).toBe(true);
  });

  it("returns no-candidates-yet when comparison still has zero candidates", () => {
    const result = compareCaptureBaselines({
      baseline: DEFAULT_CONFIGURED_BASELINE,
      comparison: comparisonSnapshot({
        bidSizeCoverageShare: 0.083,
        captureHealthVerdict: "capture-too-short",
      }),
    });

    expect(result.overallVerdict).toBe("no-candidates-yet");
  });

  it("returns ready-for-long-capture when health is research-ready but duration is short", () => {
    const result = compareCaptureBaselines({
      baseline: comparisonSnapshot({
        bidSizeCoverageShare: 0.9,
        captureHealthVerdict: "capture-research-ready",
      }),
      comparison: comparisonSnapshot({
        bidSizeCoverageShare: 0.9,
        captureHealthVerdict: "capture-research-ready",
        captureDurationSeconds: 300,
      }),
    });

    expect(result.overallVerdict).toBe("ready-for-long-capture");
    expect(result.currentBottleneck).toBe("capture-volume");
  });

  it("warns when artifacts are missing", () => {
    const loaded = loadCaptureBaselineComparisonInputs({
      config: createCaptureBaselineComparisonConfig(),
      io: buildMemoryIo({}),
    });

    expect(loaded.missingArtifacts.length).toBeGreaterThan(0);
    expect(loaded.warnings.some((warning) => warning.includes("Missing artifacts"))).toBe(true);
    expect(loaded.corruptArtifacts).toEqual([]);
  });

  it("warns when artifact JSON is corrupt and excludes it from loaded artifacts", () => {
    const loaded = loadCaptureBaselineComparisonInputs({
      config: createCaptureBaselineComparisonConfig(),
      io: buildMemoryIo({
        "data/research-results/capture-health-audit.json": "{not valid json",
      }),
    });

    expect(loaded.corruptArtifacts).toContain("data/research-results/capture-health-audit.json");
    expect(loaded.warnings.some((warning) => warning.includes("corrupt-artifact-json"))).toBe(
      true,
    );
    expect(loaded.artifacts.captureHealthAudit).toBeUndefined();
    expect(loaded.missingArtifacts).toContain("captureHealthAudit");
  });

  it("rejects unknown explicit baseline run id", () => {
    expect(() =>
      buildCaptureBaselineComparisonReport({
        generatedAt: "2026-07-10T00:00:00.000Z",
        config: createCaptureBaselineComparisonConfig({
          baselineRunId: "does-not-exist",
          useConfiguredBaseline: false,
        }),
        io: buildMemoryIo({}),
      }),
    ).toThrow(CaptureBaselineComparisonError);
  });

  it("rejects unknown explicit comparison run id", () => {
    expect(() =>
      buildCaptureBaselineComparisonReport({
        generatedAt: "2026-07-10T00:00:00.000Z",
        config: createCaptureBaselineComparisonConfig({
          comparisonRunId: "does-not-exist",
        }),
        io: buildMemoryIo({}),
      }),
    ).toThrow(/Unknown comparison run id/);
  });

  it("does not let aggregate artifacts drive selected-run verdicts", () => {
    const files = {
      [`${INPUT_DIR}/run-new/capture-health.json`]: JSON.stringify({
        runId: "run-new",
        generatedAt: "2026-07-10T00:00:00.000Z",
        verdict: "capture-research-ready",
        config: { durationSeconds: 600 },
      }),
      [`${INPUT_DIR}/run-new/top-of-book.jsonl`]: [
        topOfBookLine({
          receivedAtLocal: "2026-07-10T00:00:00.000Z",
          yesBidSize: 5,
          noBidSize: 5,
        }),
        topOfBookLine({
          receivedAtLocal: "2026-07-10T00:00:01.000Z",
          yesBidSize: 5,
          noBidSize: 5,
        }),
      ].join("\n"),
      ...artifact("data/research-results/static-parity-scan.json", {
        metrics: {
          bidOnlyGrossCandidateCount: 12,
          bidOnlyBufferAdjustedCandidateCount: 8,
        },
      }),
      ...artifact("data/research-results/bid-only-candidate-lifecycle.json", {
        metrics: {
          episodesBuilt: 7,
          persistentCandidateEpisodes: 5,
        },
      }),
      ...artifact("data/research-results/strategy-evaluation-readiness.json", {
        summary: { overallVerdict: "ready-for-offline-strategy-evaluation" },
      }),
    };

    const report = buildCaptureBaselineComparisonReport({
      generatedAt: "2026-07-10T00:00:00.000Z",
      io: buildMemoryIo(files),
      config: createCaptureBaselineComparisonConfig({
        forwardQuotesDir: INPUT_DIR,
        useLatestComparisonRun: true,
      }),
    });

    expect(report.comparison.runId).toBe("run-new");
    expect(report.comparison.source).toBe("capture-run");
    expect(report.comparison.grossCandidates).toBeNull();
    expect(report.comparison.persistentCandidateEpisodes).toBeNull();
    expect(report.comparison.strategyReadinessVerdict).toBeNull();
    expect(report.summary.overallVerdict).not.toBe("candidate-signal-emerging");
    expect(report.summary.overallVerdict).not.toBe("ready-for-outcome-study");
    expect(
      report.summary.warnings.some((warning) => warning.includes("aggregate artifact")),
    ).toBe(true);
  });

  it("selects the latest run by generated timestamp", () => {
    const files = {
      [`${INPUT_DIR}/run-old/capture-health.json`]: JSON.stringify({
        runId: "run-old",
        generatedAt: "2026-07-08T00:00:00.000Z",
      }),
      [`${INPUT_DIR}/run-old/top-of-book.jsonl`]: topOfBookLine({
        receivedAtLocal: "2026-07-08T00:00:00.000Z",
      }),
      [`${INPUT_DIR}/run-new/capture-health.json`]: JSON.stringify({
        runId: "run-new",
        generatedAt: "2026-07-10T00:00:00.000Z",
        verdict: "capture-research-ready",
        config: { durationSeconds: 600 },
      }),
      [`${INPUT_DIR}/run-new/top-of-book.jsonl`]: [
        topOfBookLine({
          receivedAtLocal: "2026-07-10T00:00:00.000Z",
          yesBidSize: 5,
          noBidSize: 5,
        }),
        topOfBookLine({
          receivedAtLocal: "2026-07-10T00:00:01.000Z",
          yesBidSize: 5,
          noBidSize: 5,
        }),
      ].join("\n"),
    };

    const io = buildMemoryIo(files);
    const loaded = loadCaptureBaselineComparisonInputs({
      config: createCaptureBaselineComparisonConfig({ forwardQuotesDir: INPUT_DIR }),
      io,
    });

    const latest = resolveSelectedRun(loaded.runs, null, true);
    expect(latest?.runId).toBe("run-new");

    const comparison = buildComparisonSnapshot({
      config: createCaptureBaselineComparisonConfig({
        forwardQuotesDir: INPUT_DIR,
        useLatestComparisonRun: true,
      }),
      artifacts: {},
      runs: loaded.runs,
      io,
    });

    expect(comparison.runId).toBe("run-new");
    expect(comparison.bidPairWithSizeCount).toBe(2);
    expect(comparison.captureHealthVerdict).toBe("capture-research-ready");
  });

  it("uses executable bid-pair coverage for run-derived bid-size share", () => {
    const files = {
      [`${INPUT_DIR}/run-new/capture-health.json`]: JSON.stringify({
        runId: "run-new",
        generatedAt: "2026-07-10T00:00:00.000Z",
      }),
      [`${INPUT_DIR}/run-new/top-of-book.jsonl`]: [
        topOfBookLine({
          receivedAtLocal: "2026-07-10T00:00:00.000Z",
          yesBidSize: 5,
          noBidSize: 5,
        }),
        topOfBookLine({
          receivedAtLocal: "2026-07-10T00:00:01.000Z",
          yesBidSize: 5,
          noBidSize: null,
        }),
        topOfBookLine({
          receivedAtLocal: "2026-07-10T00:00:02.000Z",
          yesBidSize: 0.5,
          noBidSize: 5,
        }),
        topOfBookLine({
          receivedAtLocal: "2026-07-10T00:00:03.000Z",
          yesBidSize: null,
          noBidSize: null,
        }),
      ].join("\n"),
    };

    const io = buildMemoryIo(files);
    const loaded = loadCaptureBaselineComparisonInputs({
      config: createCaptureBaselineComparisonConfig({ forwardQuotesDir: INPUT_DIR }),
      io,
    });
    const comparison = buildComparisonSnapshot({
      config: createCaptureBaselineComparisonConfig({
        forwardQuotesDir: INPUT_DIR,
        useLatestComparisonRun: true,
      }),
      artifacts: {},
      runs: loaded.runs,
      io,
    });

    expect(comparison.topOfBookCount).toBe(4);
    expect(comparison.bidPairWithSizeCount).toBe(1);
    expect(comparison.bidPairWithoutSizeCount).toBe(3);
    expect(comparison.bidSizeCoverageShare).toBe(0.25);
  });

  it("uses explicit baseline and comparison run selection", () => {
    const files = {
      [`${INPUT_DIR}/baseline-run/capture-health.json`]: JSON.stringify({
        runId: "baseline-run",
        generatedAt: "2026-07-08T00:00:00.000Z",
        config: { durationSeconds: 120 },
      }),
      [`${INPUT_DIR}/baseline-run/top-of-book.jsonl`]: topOfBookLine({
        receivedAtLocal: "2026-07-08T00:00:00.000Z",
        yesBidSize: null,
        noBidSize: null,
      }),
      [`${INPUT_DIR}/comparison-run/capture-health.json`]: JSON.stringify({
        runId: "comparison-run",
        generatedAt: "2026-07-09T00:00:00.000Z",
        verdict: "capture-research-ready",
        config: { durationSeconds: 900 },
      }),
      [`${INPUT_DIR}/comparison-run/top-of-book.jsonl`]: topOfBookLine({
        receivedAtLocal: "2026-07-09T00:00:00.000Z",
        yesBidSize: 8,
        noBidSize: 8,
      }),
    };

    const io = buildMemoryIo(files);
    const loaded = loadCaptureBaselineComparisonInputs({
      config: createCaptureBaselineComparisonConfig({ forwardQuotesDir: INPUT_DIR }),
      io,
    });

    const baseline = buildBaselineSnapshot({
      config: createCaptureBaselineComparisonConfig({
        forwardQuotesDir: INPUT_DIR,
        baselineRunId: "baseline-run",
        useConfiguredBaseline: false,
      }),
      artifacts: {},
      runs: loaded.runs,
      io,
    });
    const comparison = buildComparisonSnapshot({
      config: createCaptureBaselineComparisonConfig({
        forwardQuotesDir: INPUT_DIR,
        comparisonRunId: "comparison-run",
      }),
      artifacts: {},
      runs: loaded.runs,
      io,
    });

    expect(baseline.runId).toBe("baseline-run");
    expect(comparison.runId).toBe("comparison-run");
    expect(comparison.bidPairWithSizeCount).toBe(1);
  });

  it("builds a report with expected verdict for improved post-M12.8 snapshot", () => {
    const report = buildCaptureBaselineComparisonReport({
      generatedAt: "2026-07-10T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      io: buildMemoryIo({
        ...artifact("data/research-results/capture-health-audit.json", {
          summary: {
            verdict: "capture-research-ready",
            runDurationSeconds: 300,
            topOfBookCount: 200,
            marketsCovered: 5,
            bookState: { validBookShare: 0.98 },
            continuity: { p90TopOfBookGapMs: 1200 },
          },
        }),
        ...artifact("data/research-results/bid-size-coverage-audit.json", {
          summary: {
            bidPairWithSizeCount: 180,
            bidPairWithoutSizeCount: 20,
          },
          comparison: {
            bidSizeCoverageShare: 0.9,
            bidPairWithSizeCount: 180,
            bidPairWithoutSizeCount: 20,
          },
        }),
        ...artifact("data/research-results/static-parity-scan.json", {
          metrics: {
            topOfBookRecordsScanned: 200,
            validParitySnapshots: 150,
            bidOnlyGrossCandidateCount: 0,
            bidOnlyBufferAdjustedCandidateCount: 0,
          },
        }),
        ...artifact("data/research-results/bid-only-candidate-lifecycle.json", {
          metrics: {
            episodesBuilt: 3,
            bidOnlyCandidateRecords: 0,
            persistentCandidateEpisodes: 0,
          },
        }),
        ...artifact("data/research-results/forward-capture-readiness.json", {
          summary: { overallVerdict: "not-ready-too-short" },
        }),
      }),
      config: createCaptureBaselineComparisonConfig({
        useLatestComparisonRun: true,
      }),
    });

    expect(report.summary.overallVerdict).toBe("capture-quality-improved-need-volume");
    expect(report.summary.currentBottleneck).toBe("capture-volume");
    expect(report.comparison.bidSizeCoverageShare).toBe(0.9);
  });

  it("serializes HTML with disclaimer and no trade recommendation language", () => {
    const report = buildCaptureBaselineComparisonReport({
      generatedAt: "2026-07-10T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      io: buildMemoryIo({}),
    });

    const html = serializeCaptureBaselineComparisonHtml(report);
    expect(html).toContain("No trade recommendations");
    expect(html).toContain(report.summary.overallVerdict);
  });
});
