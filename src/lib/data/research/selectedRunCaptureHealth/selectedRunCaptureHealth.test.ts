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
const TOP_OF_BOOK = `${RUN_DIR}/top-of-book.jsonl`;
const BTC_SPOT = `${RUN_DIR}/btc-spot.jsonl`;

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

function fingerprintFor(files: Record<string, string>, path: string, role: string, recordCount: number) {
  const content = files[path] ?? "";
  const sizeBytes = Buffer.byteLength(content, "utf8");
  return {
    path,
    role,
    sizeBytes,
    mtimeMs: sizeBytes,
    recordCount,
  };
}

function researchReadyAudit(
  files: Record<string, string>,
  overrides: Record<string, unknown> = {},
) {
  return JSON.stringify({
    generatedAt: "2026-07-12T18:00:00.000Z",
    selectedRunId: RUN_ID,
    captureRunDir: RUN_DIR,
    sourceRunIds: [RUN_ID],
    analysisVersion: "selected-run-capture-health-v1",
    recordsScanned: 44870,
    inputArtifactIdentities: [
      fingerprintFor(files, TOP_OF_BOOK, "top-of-book", 44_870),
      fingerprintFor(files, BTC_SPOT, "btc-spot", 5_726),
    ],
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
    orderbook: {
      validTopOfBookRecords: 43_650,
      topOfBookRecordsEmitted: 44_870,
      reconnectCount: 0,
      sequenceGapCount: 0,
    },
    capture: { topOfBookRecordCount: 44_870 },
    ...overrides,
  });
}

describe("resolveSelectedRunId", () => {
  it("derives run id from directory basename", () => {
    expect(resolveSelectedRunId(RUN_DIR)).toBe(RUN_ID);
  });

  it("normalizes Windows path separators", () => {
    expect(resolveSelectedRunId(`data\\live-capture\\forward-quotes\\${RUN_ID}`)).toBe(RUN_ID);
  });
});

describe("resolveSelectedRunCaptureHealth", () => {
  it("prefers native capture-health.json", () => {
    const files = {
      [`${RUN_DIR}/capture-health.json`]: nativeHealth(),
      [TOP_OF_BOOK]: "{}",
      [BTC_SPOT]: "{}",
      [`${RUN_DIR}/capture-health-audit.json`]: researchReadyAudit({
        [TOP_OF_BOOK]: "{}",
        [BTC_SPOT]: "{}",
      }),
    };
    const io = createIo(files);

    const resolved = resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR });
    expect(resolved.healthSource).toBe("native-capture-health");
    expect(resolved.validBookShare).toBeCloseTo(0.9729, 4);
    expect(resolved.nativeHealthPath).toBe(`${RUN_DIR}/capture-health.json`);
    expect(resolved.completedNormally).toBeNull();
  });

  it("falls back to matching run-scoped audit when native health is missing", () => {
    const files = {
      [TOP_OF_BOOK]: "{}",
      [BTC_SPOT]: "{}",
    };
    files[`${RUN_DIR}/capture-health-audit.json`] = researchReadyAudit(files);
    const io = createIo(files);

    const resolved = resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR });
    expect(resolved.healthSource).toBe("run-scoped-capture-health-audit");
    expect(resolved.selectedRunId).toBe(RUN_ID);
    expect(resolved.runDurationSeconds).toBe(28_655);
    expect(resolved.validBookShare).toBe(0.9729);
    expect(resolved.btcJoinCoverageShare).toBe(1);
    expect(resolved.captureVerdict).toBe(RESEARCH_READY_CAPTURE_VERDICT);
    expect(resolved.completedNormally).toBeNull();
  });

  it("falls back to matching global audit when native and run-scoped are absent", () => {
    const files = {
      [TOP_OF_BOOK]: "{}",
      [BTC_SPOT]: "{}",
    };
    files["data/research-results/capture-health-audit.json"] = researchReadyAudit(files);
    const io = createIo(files);

    const resolved = resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR });
    expect(resolved.healthSource).toBe("matching-global-capture-health-audit");
    expect(resolved.globalAuditPath).toBe("data/research-results/capture-health-audit.json");
    expect(
      resolved.warnings.some((warning) => warning.includes("last-resort health source")),
    ).toBe(true);
  });

  it("rejects mismatched run-scoped audit", () => {
    const files = {
      [TOP_OF_BOOK]: "{}",
      [BTC_SPOT]: "{}",
    };
    files[`${RUN_DIR}/capture-health-audit.json`] = researchReadyAudit(files, {
      selectedRunId: "other-run",
      sourceRunIds: ["other-run"],
    });
    const io = createIo(files);

    expect(() => resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR })).toThrow(
      SelectedRunCaptureHealthError,
    );
  });

  it("rejects global audit with multiple source runs even if selectedRunId matches", () => {
    const files = {
      [TOP_OF_BOOK]: "{}",
      [BTC_SPOT]: "{}",
    };
    files["data/research-results/capture-health-audit.json"] = researchReadyAudit(files, {
      sourceRunIds: [RUN_ID, "another-run"],
    });
    const io = createIo(files);

    expect(() => resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR })).toThrow(
      /Missing capture health source/,
    );
  });

  it("rejects mismatched global audit", () => {
    const files = {
      [TOP_OF_BOOK]: "{}",
      [BTC_SPOT]: "{}",
    };
    files["data/research-results/capture-health-audit.json"] = researchReadyAudit(files, {
      selectedRunId: "other-run",
      sourceRunIds: ["other-run"],
    });
    const io = createIo(files);

    expect(() => resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR })).toThrow(
      SelectedRunCaptureHealthError,
    );
  });

  it("rejects when all health sources are missing", () => {
    const io = createIo({
      [TOP_OF_BOOK]: "{}",
      [BTC_SPOT]: "{}",
    });

    expect(() => resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR })).toThrow(
      /Missing capture health source/,
    );
  });

  it("rejects degraded run-scoped audit verdict", () => {
    const files = {
      [TOP_OF_BOOK]: "{}",
      [BTC_SPOT]: "{}",
    };
    files[`${RUN_DIR}/capture-health-audit.json`] = researchReadyAudit(files, {
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
    });
    const io = createIo(files);

    expect(() => resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR })).toThrow(
      /capture-research-ready required/,
    );
  });

  it("preserves numeric zero and does not treat it as missing", () => {
    const files = {
      [TOP_OF_BOOK]: "{}",
      [BTC_SPOT]: "{}",
    };
    files[`${RUN_DIR}/capture-health-audit.json`] = researchReadyAudit(files, {
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
    });
    const io = createIo(files);

    const resolved = resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR });
    expect(resolved.btcJoinCoverageShare).toBe(0);
    expect(resolved.p90TopOfBookGapMs).toBe(0);
    expect(resolved.reconnectCount).toBe(0);
  });

  it("rejects native runId that differs from directory name", () => {
    const io = createIo({
      [`${RUN_DIR}/capture-health.json`]: nativeHealth({ runId: "different-id" }),
      [TOP_OF_BOOK]: "{}",
      [BTC_SPOT]: "{}",
    });

    expect(() => resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR })).toThrow(
      /does not match selected run directory/,
    );
  });

  it("rejects malformed run-scoped audit JSON instead of falling through", () => {
    const io = createIo({
      [TOP_OF_BOOK]: "{}",
      [BTC_SPOT]: "{}",
      [`${RUN_DIR}/capture-health-audit.json`]: "{not-json",
    });

    expect(() => resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR })).toThrow(
      /Malformed JSON/,
    );
  });

  it("rejects stale run-scoped audit when top-of-book size changes", () => {
    const files = {
      [TOP_OF_BOOK]: "{}",
      [BTC_SPOT]: "{}",
    };
    files[`${RUN_DIR}/capture-health-audit.json`] = researchReadyAudit(files);
    files[TOP_OF_BOOK] = '{"changed":true}';
    const io = createIo(files);

    expect(() => resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR })).toThrow(
      /stale: top-of-book size changed/,
    );
  });

  it("preserves native zero reconnect count", () => {
    const io = createIo({
      [`${RUN_DIR}/capture-health.json`]: nativeHealth({
        orderbook: {
          validTopOfBookRecords: 0,
          topOfBookRecordsEmitted: 1,
          reconnectCount: 0,
          sequenceGapCount: 0,
        },
        capture: { topOfBookRecordCount: 1 },
      }),
      [TOP_OF_BOOK]: "{}",
      [BTC_SPOT]: "{}",
    });

    const resolved = resolveSelectedRunCaptureHealth({ io, captureRunDir: RUN_DIR });
    expect(resolved.reconnectCount).toBe(0);
    expect(resolved.validBookShare).toBe(0);
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
    const files = {
      [BTC_SPOT]: "{}",
    };
    files[`${RUN_DIR}/capture-health-audit.json`] = researchReadyAudit({
      [TOP_OF_BOOK]: "{}",
      [BTC_SPOT]: "{}",
    });
    const io = createIo(files);

    expect(() => validateSelectedRunCaptureDirectory({ io, captureRunDir: RUN_DIR })).toThrow(
      /top-of-book.jsonl/,
    );
  });

  it("loads real-run-shaped overnight capture through run-scoped audit", () => {
    const files = {
      [TOP_OF_BOOK]: "{}",
      [BTC_SPOT]: "{}",
    };
    files[`${RUN_DIR}/capture-health-audit.json`] = researchReadyAudit(files);
    const io = createIo(files);

    const validated = validateSelectedRunCaptureDirectory({ io, captureRunDir: RUN_DIR });
    expect(validated.health.selectedRunId).toBe(RUN_ID);
    expect(validated.health.healthSource).toBe("run-scoped-capture-health-audit");
    expect(validated.health.captureVerdict).toBe(RESEARCH_READY_CAPTURE_VERDICT);
    expect(validated.health.runDurationSeconds).toBe(28_655);
    expect(validated.health.topOfBookCount).toBe(44_870);
    expect(validated.health.btcSpotCount).toBe(5_726);
    expect(validated.health.btcJoinCoverageShare).toBe(1);
    expect(validated.health.validBookShare).toBe(0.9729);
    expect(validated.health.p90TopOfBookGapMs).toBe(1049);
  });
});
