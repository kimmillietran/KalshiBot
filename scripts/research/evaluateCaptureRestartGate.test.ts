import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { serializeCaptureRunStatus } from "@/lib/data/live/forwardQuoteCapture/captureRunStatus";
import { parseCaptureRestartGateSummary } from "@/lib/data/live/forwardQuoteCapture/captureRestartGate";

import { runCaptureRestartGateCommand } from "./evaluateCaptureRestartGate";

function createCommandIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      writeStdout: (text: string) => {
        stdout.push(text);
      },
      writeStderr: (text: string) => {
        stderr.push(text);
      },
    },
  };
}

function writeStatus(
  runDir: string,
  runId: string,
  state: "active" | "finalizing" | "completed" | "failed",
): void {
  const terminal = state === "completed" || state === "failed";
  writeFileSync(
    join(runDir, "capture-run-status.json"),
    serializeCaptureRunStatus({
      schemaVersion: 1,
      runId,
      state,
      startedAt: "2026-07-20T12:00:00.000Z",
      updatedAt: "2026-07-20T12:20:00.000Z",
      endedAt: terminal ? "2026-07-20T12:20:00.000Z" : null,
      captureEndReason: terminal ? "duration-complete" : null,
      failureReason: null,
    }),
    "utf8",
  );
}

/**
 * Writes a complete healthy smoke run: terminal status, full native health,
 * source artifacts, and a schema-valid research-ready audit whose artifact
 * fingerprints match the files actually on disk.
 */
function writeHealthySmokeRun(
  root: string,
  runId: string,
  options: { auditVerdict?: string } = {},
): string {
  const runDir = join(root, runId);
  mkdirSync(runDir, { recursive: true });
  writeStatus(runDir, runId, "completed");

  const topOfBookPath = join(runDir, "top-of-book.jsonl");
  const btcSpotPath = join(runDir, "btc-spot.jsonl");
  writeFileSync(topOfBookPath, `${JSON.stringify({ marketTicker: "KXBTC15M-T" })}\n`, "utf8");
  writeFileSync(btcSpotPath, `${JSON.stringify({ priceUsd: 100_000 })}\n`, "utf8");

  writeFileSync(
    join(runDir, "capture-health.json"),
    JSON.stringify({
      runId,
      verdict: "capture-mvp-success",
      connection: {
        terminalFailureReason: null,
        captureEndReason: "duration-complete",
        completedNormally: true,
      },
      capture: { topOfBookRecordCount: 4_000, btcSpotRecordCount: 240 },
      orderbook: {
        sequenceGapEpisodeCount: 0,
        sequenceGapCount: 0,
        deltasQuarantinedDuringResync: 0,
        snapshotRecoveryRequestCount: 0,
        snapshotRecoverySuccessCount: 0,
        snapshotRecoveryFailureCount: 0,
        snapshotRecoveryTimeoutCount: 0,
        snapshotRecoveryExhaustedCount: 0,
        pendingCommandTimeoutCount: 0,
        pendingCommandCountAtCaptureEnd: 0,
        marketsWithOutstandingRecoveryAtEnd: 0,
        commandErrorsReceived: 0,
      },
      writer: { allStreamsDrained: true, backpressureEventCount: 0, failure: null },
      watchdog: { terminalWebSocketFailure: false },
    }),
    "utf8",
  );

  const topStat = statSync(topOfBookPath);
  const btcStat = statSync(btcSpotPath);
  writeFileSync(
    join(runDir, "capture-health-audit.json"),
    JSON.stringify({
      generatedAt: "2026-07-20T12:25:00.000Z",
      outputPath: join(runDir, "capture-health-audit.json"),
      htmlOutputPath: "data/reports/capture-health-audit.html",
      captureRunDir: runDir,
      selectedRunId: runId,
      sourceRunIds: [runId],
      analysisVersion: "capture-health-audit-v3",
      inputArtifactIdentities: [
        {
          path: topOfBookPath,
          role: "top-of-book",
          sizeBytes: topStat.size,
          mtimeMs: topStat.mtimeMs,
          recordCount: 1,
        },
        {
          path: btcSpotPath,
          role: "btc-spot",
          sizeBytes: btcStat.size,
          mtimeMs: btcStat.mtimeMs,
          recordCount: 1,
        },
      ],
      summary: {
        verdict: options.auditVerdict ?? "capture-research-ready",
        recommendedNextAction: "proceed-offline-microstructure-research",
        runDurationSeconds: 1_200,
        topOfBookCount: 4_000,
        btcSpotCount: 240,
        bookState: { validBookShare: 0.97, sequenceGapCount: 0, reconnectCount: 0 },
        btcJoin: { joinCoverageShare: 0.95, btcSpotRequested: true },
        continuity: { p90TopOfBookGapMs: 800 },
      },
    }),
    "utf8",
  );

  return runDir;
}

describe("runCaptureRestartGateCommand (filesystem)", () => {
  let root: string | null = null;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = null;
    }
  });

  it("refuses to run while an active capture marker exists", async () => {
    root = mkdtempSync(join(tmpdir(), "restart-gate-"));
    const activeDir = join(root, "run-active");
    mkdirSync(activeDir, { recursive: true });
    writeStatus(activeDir, "run-active", "active");
    writeHealthySmokeRun(root, "run-completed");

    const { io, stdout, stderr } = createCommandIo();
    const exitCode = await runCaptureRestartGateCommand(
      ["--assert-no-active-capture", "--capture-root", root],
      io,
    );

    expect(exitCode).toBe(1);
    expect(stdout.join("")).toContain("run-active");
    expect(stderr.join("")).toContain("Refusing to start");
  });

  it("passes the no-active-capture preflight when all runs are terminal", async () => {
    root = mkdtempSync(join(tmpdir(), "restart-gate-"));
    writeHealthySmokeRun(root, "run-completed");

    const { io } = createCommandIo();
    const exitCode = await runCaptureRestartGateCommand(
      ["--assert-no-active-capture", "--capture-root", root],
      io,
    );

    expect(exitCode).toBe(0);
  });

  it("audits the exact requested run directory, never the newest one", async () => {
    root = mkdtempSync(join(tmpdir(), "restart-gate-"));
    const targetDir = writeHealthySmokeRun(root, "run-target");
    // A newer decoy run exists; the gate must still evaluate run-target only.
    const decoyDir = join(root, "run-decoy-newest");
    mkdirSync(decoyDir, { recursive: true });
    writeStatus(decoyDir, "run-decoy-newest", "failed");

    const { io, stdout } = createCommandIo();
    const exitCode = await runCaptureRestartGateCommand(
      [
        "--capture-run-dir",
        targetDir,
        "--expected-duration-minutes",
        "20",
      ],
      io,
      { generatedAt: "2026-07-20T12:30:00.000Z" },
    );

    expect(exitCode).toBe(0);
    const summary = parseCaptureRestartGateSummary(stdout.join(""));
    expect(summary).not.toBeNull();
    expect(summary?.runId).toBe("run-target");
    expect(summary?.runDir).toBe(targetDir);
    expect(summary?.restartEightHourCaptures).toBe(true);
    expect(summary?.auditVerdict).toBe("capture-research-ready");
    expect(summary?.auditFingerprintsVerified).toBe(true);
    expect(summary?.failureReasons).toEqual([]);
  });

  it("fails the gate when the audit verdict is not research-ready", async () => {
    root = mkdtempSync(join(tmpdir(), "restart-gate-"));
    const runDir = writeHealthySmokeRun(root, "run-gappy", {
      auditVerdict: "capture-gappy",
    });

    const { io, stdout, stderr } = createCommandIo();
    const exitCode = await runCaptureRestartGateCommand(
      ["--capture-run-dir", runDir, "--expected-duration-minutes", "20"],
      io,
    );

    expect(exitCode).toBe(1);
    const summary = parseCaptureRestartGateSummary(stdout.join(""));
    expect(summary?.restartEightHourCaptures).toBe(false);
    expect(summary?.failureReasons.join("\n")).toContain("capture-gappy");
    expect(stderr.join("")).toContain("Restart gate FAILED");
  });

  it("fails the gate when the audit is stale against the source artifacts", async () => {
    root = mkdtempSync(join(tmpdir(), "restart-gate-"));
    const runDir = writeHealthySmokeRun(root, "run-stale");
    // Mutate a fingerprinted source artifact after the audit was generated.
    writeFileSync(
      join(runDir, "top-of-book.jsonl"),
      `${JSON.stringify({ marketTicker: "KXBTC15M-T" })}\n${JSON.stringify({ marketTicker: "KXBTC15M-T" })}\n`,
      "utf8",
    );

    const { io, stdout } = createCommandIo();
    const exitCode = await runCaptureRestartGateCommand(
      ["--capture-run-dir", runDir, "--expected-duration-minutes", "20"],
      io,
    );

    expect(exitCode).toBe(1);
    const summary = parseCaptureRestartGateSummary(stdout.join(""));
    expect(summary?.restartEightHourCaptures).toBe(false);
    expect(summary?.auditFingerprintsVerified).toBe(false);
    expect(summary?.failureReasons.join("\n")).toContain("stale");
  });

  it("exits nonzero with usage guidance when no mode flag is provided", async () => {
    const { io, stderr } = createCommandIo();
    const exitCode = await runCaptureRestartGateCommand([], io);

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("--capture-run-dir");
  });
});
