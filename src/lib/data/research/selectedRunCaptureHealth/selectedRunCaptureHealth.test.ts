import { describe, expect, it } from "vitest";

import { createMemoryJsonlIo } from "@/lib/data/research/jsonl";

import {
  RESEARCH_READY_CAPTURE_VERDICT,
  resolveSelectedRunCaptureHealth,
  resolveSelectedRunId,
  SelectedRunCaptureHealthError,
  validateSelectedRunCaptureDirectory,
} from "./index";

const RUN_DIR = "data/live-capture/forward-quotes/2026-07-12T10-18-27-409Z";
const RUN_ID = "2026-07-12T10-18-27-409Z";

function createIo(
  files: Record<string, string>,
  dirs: string[] = [RUN_DIR],
) {
  const dirSet = new Set(dirs.map((dir) => dir.replaceAll("\\", "/")));
  const jsonl = createMemoryJsonlIo(files);
  return {
    ...jsonl,
    fileExists: (path: string) => {
      const normalized = path.replaceAll("\\", "/");
      return jsonl.fileExists(path) || dirSet.has(normalized);
    },
    isDirectory: (path: string) => dirSet.has(path.replaceAll("\\", "/")),
  };
}

function researchReadyAudit(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    generatedAt: "2026-07-12T18:00:00.000Z",
    selectedRunId: RUN_ID,
    captureRunDir: RUN_DIR,
    sourceRunIds: [RUN_ID],
    analysisVersion: "selected-run-capture-health-v1",
    recordsScanned: 44870,
    summary: {
      verdict: RESEARCH_READY_CAPTURE_VERDICT,
      recommendedNextAction: "continue-forward-research",
      runDurationSeconds: 28_655,
      topOfBookCount: 44_870,
      btcSpotCount: 5_726,
      bookState: {
        validBookShare: 0.9729,
        reconnectCount: 0,
        sequenceGapCount: 0,
      },
      btcJoin: { joinCoverageShare: 1 },
      continuity: { p90TopOfBookGapMs: 1049 },
    },
    ...overrides,
  });
}

function nativeHealth(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    runId: RUN_ID,
    config: { durationSeconds: 28_655 },
    orderbook: { validTopOfBookRecords: 43_650, topOfBookRecordsEmitted: 44_870, reconnectCount: 0, sequenceGapCount: 0 },
    capture: { topOfBookRecordCount: 44_870 },
    ...overrides,
  });
}

describe("resolveSelectedRunId", () => {
  it("derives run id from directory basename", () => {
    expect(resolveSelectedRunId(RUN_DIR)).toBe(RUN_ID);
  });
});

describe("resolveSelectedRunCaptureHealth", () => {
  it("prefers native capture-health.json", () => {
    const io = createIo({
      [`${RUN_DIR}/capture-health.json`]: nativeHealth(),
      [`${RUN_DIR}/top-of-book.jsonl`]: "{}",
      [`${RUN_DIR}/btc-spot.jsonl`]: "{}",
      [`${RUN_DIR}/capture-health-audit.json`]: researchReadyAudit(),
    });

    const resolved = resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR });
    expect(resolved.healthSource).toBe("native-capture-health");
    expect(resolved.validBookShare).toBeCloseTo(0.9729, 4);
    expect(resolved.nativeHealthPath).toBe(`${RUN_DIR}/capture-health.json`);
  });

  it("falls back to matching run-scoped audit when native health is missing", () => {
    const io = createIo({
      [`${RUN_DIR}/top-of-book.jsonl`]: "{}",
      [`${RUN_DIR}/btc-spot.jsonl`]: "{}",
      [`${RUN_DIR}/capture-health-audit.json`]: researchReadyAudit(),
    });

    const resolved = resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR });
    expect(resolved.healthSource).toBe("run-scoped-capture-health-audit");
    expect(resolved.selectedRunId).toBe(RUN_ID);
    expect(resolved.runDurationSeconds).toBe(28_655);
    expect(resolved.validBookShare).toBe(0.9729);
    expect(resolved.btcJoinCoverageShare).toBe(1);
    expect(resolved.captureVerdict).toBe(RESEARCH_READY_CAPTURE_VERDICT);
  });

  it("falls back to matching global audit when native and run-scoped are absent", () => {
    const io = createIo({
      [`${RUN_DIR}/top-of-book.jsonl`]: "{}",
      [`${RUN_DIR}/btc-spot.jsonl`]: "{}",
      "data/research-results/capture-health-audit.json": researchReadyAudit(),
    });

    const resolved = resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR });
    expect(resolved.healthSource).toBe("matching-global-capture-health-audit");
    expect(resolved.globalAuditPath).toBe("data/research-results/capture-health-audit.json");
  });

  it("rejects mismatched run-scoped audit", () => {
    const io = createIo({
      [`${RUN_DIR}/top-of-book.jsonl`]: "{}",
      [`${RUN_DIR}/btc-spot.jsonl`]: "{}",
      [`${RUN_DIR}/capture-health-audit.json`]: researchReadyAudit({
        selectedRunId: "other-run",
        sourceRunIds: ["other-run"],
      }),
    });

    expect(() => resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR })).toThrow(
      SelectedRunCaptureHealthError,
    );
  });

  it("rejects mismatched global audit", () => {
    const io = createIo({
      [`${RUN_DIR}/top-of-book.jsonl`]: "{}",
      [`${RUN_DIR}/btc-spot.jsonl`]: "{}",
      "data/research-results/capture-health-audit.json": researchReadyAudit({
        selectedRunId: "other-run",
        sourceRunIds: ["other-run"],
      }),
    });

    expect(() => resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR })).toThrow(
      SelectedRunCaptureHealthError,
    );
  });

  it("rejects when all health sources are missing", () => {
    const io = createIo({
      [`${RUN_DIR}/top-of-book.jsonl`]: "{}",
      [`${RUN_DIR}/btc-spot.jsonl`]: "{}",
    });

    expect(() => resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR })).toThrow(
      /Missing capture health source/,
    );
  });

  it("rejects degraded run-scoped audit verdict", () => {
    const io = createIo({
      [`${RUN_DIR}/top-of-book.jsonl`]: "{}",
      [`${RUN_DIR}/btc-spot.jsonl`]: "{}",
      [`${RUN_DIR}/capture-health-audit.json`]: researchReadyAudit({
        summary: {
          verdict: "capture-degraded",
          recommendedNextAction: "repair-capture",
          runDurationSeconds: 28_655,
          topOfBookCount: 44_870,
          btcSpotCount: 5_726,
          bookState: { validBookShare: 0.5, reconnectCount: 0, sequenceGapCount: 0 },
          btcJoin: { joinCoverageShare: 0.5 },
          continuity: { p90TopOfBookGapMs: 5000 },
        },
      }),
    });

    expect(() => resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR })).toThrow(
      /capture-research-ready required/,
    );
  });

  it("preserves numeric zero and does not treat it as missing", () => {
    const io = createIo({
      [`${RUN_DIR}/top-of-book.jsonl`]: "{}",
      [`${RUN_DIR}/btc-spot.jsonl`]: "{}",
      [`${RUN_DIR}/capture-health-audit.json`]: researchReadyAudit({
        summary: {
          verdict: RESEARCH_READY_CAPTURE_VERDICT,
          recommendedNextAction: "continue-forward-research",
          runDurationSeconds: 28_655,
          topOfBookCount: 44_870,
          btcSpotCount: 5_726,
          bookState: { validBookShare: 0.9729, reconnectCount: 0, sequenceGapCount: 0 },
          btcJoin: { joinCoverageShare: 0 },
          continuity: { p90TopOfBookGapMs: 0 },
        },
      }),
    });

    const resolved = resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR });
    expect(resolved.btcJoinCoverageShare).toBe(0);
    expect(resolved.p90TopOfBookGapMs).toBe(0);
    expect(resolved.reconnectCount).toBe(0);
  });

  it("warns when native runId differs from directory name", () => {
    const io = createIo({
      [`${RUN_DIR}/capture-health.json`]: nativeHealth({ runId: "different-id" }),
      [`${RUN_DIR}/top-of-book.jsonl`]: "{}",
      [`${RUN_DIR}/btc-spot.jsonl`]: "{}",
    });

    const resolved = resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR });
    expect(resolved.selectedRunId).toBe("different-id");
    expect(resolved.warnings.some((warning) => warning.includes("differs from directory name"))).toBe(true);
  });
});

describe("validateSelectedRunCaptureDirectory", () => {
  it("fails clearly for unknown run directories", () => {
    const io = createIo({}, []);
    expect(() => validateSelectedRunCaptureDirectory({ io, captureRunDir: RUN_DIR })).toThrow(
      /Unknown capture run directory/,
    );
  });

  it("requires top-of-book.jsonl", () => {
    const io = createIo({
      [`${RUN_DIR}/btc-spot.jsonl`]: "{}",
      [`${RUN_DIR}/capture-health-audit.json`]: researchReadyAudit(),
    });

    expect(() => validateSelectedRunCaptureDirectory({ io, captureRunDir: RUN_DIR })).toThrow(
      /top-of-book.jsonl/,
    );
  });
});
