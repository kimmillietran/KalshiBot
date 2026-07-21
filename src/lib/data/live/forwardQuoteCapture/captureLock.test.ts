import { describe, expect, it } from "vitest";

import { acquireCaptureLock, resolveCaptureLockPath } from "./captureLock";
import { runForwardQuoteCapture } from "./runForwardQuoteCapture";
import type { ForwardQuoteCaptureConfig, ForwardQuoteCaptureIo } from "./forwardQuoteCaptureTypes";

const OUTPUT_DIR = "in-memory/lock-test/forward-quotes";

/**
 * In-memory io whose createExclusiveFile is atomic within the JS runtime:
 * has-then-set runs synchronously, exactly like O_EXCL on one filesystem.
 */
function createInMemoryIo(): {
  io: ForwardQuoteCaptureIo;
  files: Map<string, string>;
} {
  const files = new Map<string, string>();
  let nowMs = Date.UTC(2026, 6, 20);
  let monotonicMs = 0;

  const io: ForwardQuoteCaptureIo = {
    readFile: (path) => {
      const contents = files.get(path);
      if (contents === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return contents;
    },
    writeFile: (path, data) => {
      files.set(path, data);
    },
    appendFile: (path, data) => {
      files.set(path, `${files.get(path) ?? ""}${data}`);
    },
    renameFile: (from, to) => {
      const contents = files.get(from);
      if (contents === undefined) {
        throw new Error(`ENOENT rename source: ${from}`);
      }
      files.delete(from);
      files.set(to, contents);
    },
    createExclusiveFile: (path, data) => {
      if (files.has(path)) {
        throw new Error(`EEXIST: ${path}`);
      }
      files.set(path, data);
    },
    deleteFile: (path) => {
      files.delete(path);
    },
    mkdirSync: () => {},
    now: () => {
      nowMs += 1;
      return new Date(nowMs);
    },
    monotonicNowMs: () => {
      monotonicMs += 1;
      return monotonicMs;
    },
    setInterval: () => 1,
    clearInterval: () => {},
  };
  return { io, files };
}

function dryRunConfig(): ForwardQuoteCaptureConfig {
  return {
    series: "KXBTC15M",
    durationMinutes: 1,
    maxMarkets: 1,
    outputDir: OUTPUT_DIR,
    dryRun: true,
    captureBtcSpot: false,
    rolloverCheckSeconds: 30,
    healthFlushSeconds: 60,
    topOfBookThrottleMs: 0,
    wsWatchdogEnabled: false,
    wsSoftSilenceThresholdMs: 30_000,
    wsHardStallThresholdMs: 60_000,
    wsProbeGraceMs: 10_000,
    wsRecoveryMaxAttempts: 1,
  };
}

describe("acquireCaptureLock", () => {
  it("acquires and releases the lock at the capture root", () => {
    const { io, files } = createInMemoryIo();
    const handle = acquireCaptureLock({ io, outputDir: OUTPUT_DIR, runId: "run-1" });

    expect(handle).not.toBeNull();
    const lockPath = resolveCaptureLockPath(OUTPUT_DIR);
    expect(handle!.lockPath).toBe(lockPath);
    expect(files.has(lockPath)).toBe(true);
    expect(files.get(lockPath)).toContain("run-1");

    handle!.release();
    expect(files.has(lockPath)).toBe(false);
  });

  it("throws with an operator-actionable message when the lock is already held", () => {
    const { io } = createInMemoryIo();
    const first = acquireCaptureLock({ io, outputDir: OUTPUT_DIR, runId: "run-1" });
    expect(first).not.toBeNull();

    expect(() =>
      acquireCaptureLock({ io, outputDir: OUTPUT_DIR, runId: "run-2" }),
    ).toThrowError(/Another capture appears to be running/);
  });

  it("returns null (no locking) when the io lacks exclusive creation", () => {
    const { io } = createInMemoryIo();
    delete io.createExclusiveFile;
    expect(acquireCaptureLock({ io, outputDir: OUTPUT_DIR, runId: "run-1" })).toBeNull();
  });
});

describe("runForwardQuoteCapture capture lock integration", () => {
  it("prevents two concurrent capture starts atomically", async () => {
    const { io, files } = createInMemoryIo();

    const [first, second] = await Promise.allSettled([
      runForwardQuoteCapture({ config: dryRunConfig(), io, credentialEnv: {} }),
      runForwardQuoteCapture({ config: dryRunConfig(), io, credentialEnv: {} }),
    ]);

    const outcomes = [first, second];
    const fulfilled = outcomes.filter((entry) => entry.status === "fulfilled");
    const rejected = outcomes.filter((entry) => entry.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String((rejected[0] as PromiseRejectedResult).reason)).toContain(
      "Another capture appears to be running",
    );

    // The winning run completed and released the lock for the next capture.
    expect(files.has(resolveCaptureLockPath(OUTPUT_DIR))).toBe(false);

    // The losing run created no artifacts: exactly one run-status file exists.
    const statusFiles = [...files.keys()].filter((path) =>
      path.endsWith("capture-run-status.json"),
    );
    expect(statusFiles).toHaveLength(1);
  });

  it("releases the lock only after the terminal status is published", async () => {
    const { io, files } = createInMemoryIo();
    const lockPath = resolveCaptureLockPath(OUTPUT_DIR);
    let lockHeldAtTerminalPublication: boolean | null = null;

    const originalRename = io.renameFile!;
    io.renameFile = (from, to) => {
      originalRename(from, to);
      if (to.endsWith("capture-run-status.json")) {
        const contents = files.get(to) ?? "";
        if (contents.includes('"completed"') || contents.includes('"failed"')) {
          lockHeldAtTerminalPublication = files.has(lockPath);
        }
      }
    };

    await runForwardQuoteCapture({ config: dryRunConfig(), io, credentialEnv: {} });

    expect(lockHeldAtTerminalPublication).toBe(true);
    expect(files.has(lockPath)).toBe(false);
  });

  it("releases the lock when the capture fails", async () => {
    const { io, files } = createInMemoryIo();
    // Force an unexpected failure after lock acquisition by breaking the
    // atomic health-report publication.
    const originalWrite = io.writeFile;
    io.writeFile = (path, data) => {
      if (path.includes("capture-health")) {
        throw new Error("disk full (scripted)");
      }
      originalWrite(path, data);
    };

    await expect(
      runForwardQuoteCapture({ config: dryRunConfig(), io, credentialEnv: {} }),
    ).rejects.toThrow("disk full (scripted)");

    expect(files.has(resolveCaptureLockPath(OUTPUT_DIR))).toBe(false);
  });
});
