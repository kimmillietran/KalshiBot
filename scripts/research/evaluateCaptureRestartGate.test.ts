import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { serializeCaptureRunStatus } from "@/lib/data/live/forwardQuoteCapture/captureRunStatus";
import {
  CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE,
  parseCaptureRestartGateSummary,
} from "@/lib/data/live/forwardQuoteCapture/captureRestartGate";

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
      endedAt: "2026-07-20T12:20:00.000Z",
      config: {
        series: "KXBTC15M",
        captureBtcSpot: true,
        topOfBookThrottleMs: 1_000,
        maxMarkets: 5,
        wsWatchdogEnabled: true,
        priceRepresentation: "legacy-no-leg",
        durationMinutes: 20,
      },
      connection: {
        terminalFailureReason: null,
        captureEndReason: "duration-complete",
        completedNormally: true,
        liveConnectionSucceeded: true,
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
      errors: [],
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

  it("blocks capture start on an invalid (corrupt) status marker", async () => {
    root = mkdtempSync(join(tmpdir(), "restart-gate-"));
    const corruptDir = join(root, "run-corrupt");
    mkdirSync(corruptDir, { recursive: true });
    writeFileSync(join(corruptDir, "capture-run-status.json"), "{ not json", "utf8");

    const { io, stderr } = createCommandIo();
    const exitCode = await runCaptureRestartGateCommand(
      ["--assert-no-active-capture", "--capture-root", root],
      io,
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("invalid-status");
  });

  it("blocks capture start on an identity-mismatched status marker", async () => {
    root = mkdtempSync(join(tmpdir(), "restart-gate-"));
    const mismatchedDir = join(root, "run-mismatched");
    mkdirSync(mismatchedDir, { recursive: true });
    // Status claims a different runId than its own directory.
    writeStatus(mismatchedDir, "some-other-run", "completed");

    const { io, stderr } = createCommandIo();
    const exitCode = await runCaptureRestartGateCommand(
      ["--assert-no-active-capture", "--capture-root", root],
      io,
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("identity-mismatched-status");
  });

  it("blocks capture start while the global capture lock is present", async () => {
    root = mkdtempSync(join(tmpdir(), "restart-gate-"));
    writeHealthySmokeRun(root, "run-completed");
    writeFileSync(join(root, "capture.lock"), '{"runId":"run-crashed"}\n', "utf8");

    const { io, stderr } = createCommandIo();
    const exitCode = await runCaptureRestartGateCommand(
      ["--assert-no-active-capture", "--capture-root", root],
      io,
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("capture lock is present");
  });

  it("prints the canonical eight-hour capture profile", async () => {
    const { io, stdout } = createCommandIo();
    const exitCode = await runCaptureRestartGateCommand(
      ["--print-canonical-profile"],
      io,
    );

    expect(exitCode).toBe(0);
    const profile = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(profile.series).toBe("KXBTC15M");
    expect(profile.topOfBookThrottleMs).toBe(1_000);
    expect(profile.maxMarkets).toBe(5);
    expect(profile.smokeDurationMinutesMin).toBe(15);
    expect(profile.smokeDurationMinutesMax).toBe(30);
  });

  it("rejects every threshold-weakening flag from the command line", async () => {
    root = mkdtempSync(join(tmpdir(), "restart-gate-"));
    const runDir = writeHealthySmokeRun(root, "run-target");

    for (const flag of [
      "--duration-tolerance-share",
      "--min-valid-book-share",
      "--min-btc-join-coverage-share",
    ]) {
      const { io, stderr } = createCommandIo();
      const exitCode = await runCaptureRestartGateCommand(
        ["--capture-run-dir", runDir, flag, "0"],
        io,
      );
      expect(exitCode).toBe(1);
      expect(stderr.join("")).toContain("cannot be weakened");
    }
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

describe("runCaptureRestartGateCommand canonical profile file mode", () => {
  let root: string | null = null;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = null;
    }
  });

  it("writes the canonical profile as UTF-8 JSON with a trailing newline", async () => {
    root = mkdtempSync(join(tmpdir(), "restart-gate-profile-"));
    const outputPath = join(root, "profile.json");

    const { io, stdout } = createCommandIo();
    const exitCode = await runCaptureRestartGateCommand(
      ["--write-canonical-profile", outputPath],
      io,
    );

    expect(exitCode).toBe(0);
    // File mode must not write logs or labels to stdout.
    expect(stdout.join("")).toBe("");

    const raw = readFileSync(outputPath, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    // No BOM and no leading noise: the payload must start with the opening
    // brace that Windows PowerShell 5.1 lost in the stdout transport.
    expect(raw.charAt(0)).toBe("{");

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed).toEqual(CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE);
  });

  it("keeps the canonical profile values unchanged", async () => {
    root = mkdtempSync(join(tmpdir(), "restart-gate-profile-"));
    const outputPath = join(root, "profile.json");

    const { io } = createCommandIo();
    await runCaptureRestartGateCommand(["--write-canonical-profile", outputPath], io);

    const parsed = JSON.parse(readFileSync(outputPath, "utf8")) as Record<string, unknown>;
    expect(parsed.series).toBe("KXBTC15M");
    expect(parsed.maxMarkets).toBe(5);
    expect(parsed.topOfBookThrottleMs).toBe(1_000);
    expect(parsed.captureBtcSpot).toBe(true);
    expect(parsed.wsWatchdogEnabled).toBe(true);
    expect(parsed.priceRepresentation).toBe("legacy-no-leg");
    expect(parsed.eightHourDurationMinutes).toBe(480);
    expect(parsed.smokeDurationMinutesMin).toBe(15);
    expect(parsed.smokeDurationMinutesMax).toBe(30);
  });

  it("exits nonzero with guidance when the output path is missing", async () => {
    const { io, stderr } = createCommandIo();
    const exitCode = await runCaptureRestartGateCommand(
      ["--write-canonical-profile"],
      io,
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("--write-canonical-profile <path>");
  });

  it("exits nonzero when the file cannot be written", async () => {
    root = mkdtempSync(join(tmpdir(), "restart-gate-profile-"));
    const outputPath = join(root, "does-not-exist", "profile.json");

    const { io, stderr } = createCommandIo();
    const exitCode = await runCaptureRestartGateCommand(
      ["--write-canonical-profile", outputPath],
      io,
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("").length).toBeGreaterThan(0);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects conflicting mode flags", async () => {
    root = mkdtempSync(join(tmpdir(), "restart-gate-profile-"));
    const outputPath = join(root, "profile.json");

    const conflictingInvocations: string[][] = [
      ["--write-canonical-profile", outputPath, "--print-canonical-profile"],
      ["--write-canonical-profile", outputPath, "--assert-no-active-capture"],
      ["--print-canonical-profile", "--assert-no-active-capture"],
      ["--write-canonical-profile", outputPath, "--capture-run-dir", root],
    ];

    for (const argv of conflictingInvocations) {
      const { io, stderr } = createCommandIo();
      const exitCode = await runCaptureRestartGateCommand(argv, io);
      expect(exitCode).toBe(1);
      expect(stderr.join("")).toContain("Conflicting mode flags");
    }
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects unknown arguments instead of ignoring them", async () => {
    const { io, stderr } = createCommandIo();
    const exitCode = await runCaptureRestartGateCommand(
      ["--print-canonical-profile", "--frobnicate"],
      io,
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("Unknown argument(s): --frobnicate");
  });

  it("writes only profile JSON to the file when run as a real CLI process", () => {
    // Regression for the Windows PowerShell 5.1 failure: importing
    // loadCaptureRunSelectionEntries used to run selectAuditableCaptureRun's
    // main() as an import side effect, so the real process emitted a
    // selection JSON line before doing anything else. The file transport
    // plus the entrypoint guard must yield a clean parseable profile file
    // regardless of what stdout carries.
    root = mkdtempSync(join(tmpdir(), "restart-gate-profile-"));
    const outputPath = join(root, "profile.json");

    // The child must not inherit VITEST=true, or the CLI entry guard would
    // (correctly) skip main() as it does for in-process test imports.
    const childEnv = { ...process.env };
    delete childEnv.VITEST;

    const result = spawnSync(
      process.execPath,
      [
        join("node_modules", "tsx", "dist", "cli.mjs"),
        join("scripts", "research", "evaluateCaptureRestartGate.ts"),
        "--write-canonical-profile",
        outputPath,
      ],
      { encoding: "utf8", timeout: 120_000, env: childEnv },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");

    const parsed = JSON.parse(readFileSync(outputPath, "utf8")) as Record<string, unknown>;
    expect(parsed).toEqual(CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE);
  });
});
