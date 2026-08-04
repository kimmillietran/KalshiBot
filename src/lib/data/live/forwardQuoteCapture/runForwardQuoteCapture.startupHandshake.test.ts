import { describe, expect, it } from "vitest";

import { resolveCaptureLockPath } from "./captureLock";
import { parseCaptureRunStatus } from "./captureRunStatus";
import { runForwardQuoteCapture } from "./runForwardQuoteCapture";
import type {
  ForwardQuoteCaptureConfig,
  ForwardQuoteCaptureIo,
} from "./forwardQuoteCaptureTypes";

const OUTPUT_DIR = "in-memory/startup-handshake/forward-quotes";

function createInMemoryIo(): {
  io: ForwardQuoteCaptureIo;
  files: Map<string, string>;
  dirs: Set<string>;
} {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  let nowMs = Date.UTC(2026, 7, 3, 12, 0, 0);
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
    mkdirSync: (path) => {
      dirs.add(path.replaceAll("\\", "/"));
    },
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
  return { io, files, dirs };
}

function dryRunConfig(
  overrides: Partial<ForwardQuoteCaptureConfig> = {},
): ForwardQuoteCaptureConfig {
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
    ...overrides,
  };
}

describe("runForwardQuoteCapture onRunStarted handshake", () => {
  it("fires after active status with exact run directory and core runId", async () => {
    const { io, files, dirs } = createInMemoryIo();
    const events: Array<{
      identity: {
        runId: string;
        outputDir: string;
        runDir: string;
        startedAt: string;
      };
      statusState: string | null;
      runDirExists: boolean;
    }> = [];

    const result = await runForwardQuoteCapture({
      config: dryRunConfig(),
      io,
      credentialEnv: {},
      onRunStarted: (identity) => {
        const status = parseCaptureRunStatus(
          files.get(`${identity.runDir}/capture-run-status.json`) ?? "",
        );
        events.push({
          identity,
          statusState: status?.state ?? null,
          runDirExists: dirs.has(identity.runDir),
        });
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.statusState).toBe("active");
    expect(events[0]?.runDirExists).toBe(true);
    expect(events[0]?.identity.runId).toBe(result.runId);
    expect(events[0]?.identity.outputDir).toBe(OUTPUT_DIR);
    expect(events[0]?.identity.runDir).toBe(`${OUTPUT_DIR}/${result.runId}`);
    expect(events[0]?.identity.startedAt).toMatch(/^\d{4}-/);
  });

  it("fires the callback exactly once", async () => {
    const { io } = createInMemoryIo();
    let calls = 0;
    await runForwardQuoteCapture({
      config: dryRunConfig(),
      io,
      credentialEnv: {},
      onRunStarted: () => {
        calls += 1;
      },
    });
    expect(calls).toBe(1);
  });

  it("does not fire when lock acquisition fails", async () => {
    const { io } = createInMemoryIo();
    let calls = 0;
    // Hold the lock first.
    await runForwardQuoteCapture({
      config: dryRunConfig(),
      io,
      credentialEnv: {},
    });
    // Re-acquire by planting a lock without releasing path — create exclusive conflict.
    const lockPath = resolveCaptureLockPath(OUTPUT_DIR);
    io.createExclusiveFile!(lockPath, '{"runId":"holder"}\n');

    await expect(
      runForwardQuoteCapture({
        config: dryRunConfig(),
        io,
        credentialEnv: {},
        onRunStarted: () => {
          calls += 1;
        },
      }),
    ).rejects.toThrow(/Another capture appears to be running/);

    expect(calls).toBe(0);
  });

  it("does not fire when initialization fails before active status", async () => {
    const { io, files } = createInMemoryIo();
    let calls = 0;
    const originalMkdir = io.mkdirSync;
    io.mkdirSync = (path, options) => {
      const normalized = path.replaceAll("\\", "/");
      if (normalized.includes("/2026-") || /\/\d{4}-\d{2}-\d{2}T/.test(normalized)) {
        throw new Error("mkdir failed before active status");
      }
      originalMkdir(path, options);
    };

    await expect(
      runForwardQuoteCapture({
        config: dryRunConfig(),
        io,
        credentialEnv: {},
        onRunStarted: () => {
          calls += 1;
        },
      }),
    ).rejects.toThrow(/mkdir failed before active status/);

    expect(calls).toBe(0);
    expect(files.has(resolveCaptureLockPath(OUTPUT_DIR))).toBe(false);
    expect(
      [...files.keys()].some((path) => path.endsWith("capture-run-status.json")),
    ).toBe(false);
  });

  it("leaves truthful terminal failed status and releases lock when callback throws", async () => {
    const { io, files } = createInMemoryIo();
    const lockPath = resolveCaptureLockPath(OUTPUT_DIR);

    await expect(
      runForwardQuoteCapture({
        config: dryRunConfig(),
        io,
        credentialEnv: {},
        onRunStarted: () => {
          throw new Error("operator handshake write failed");
        },
      }),
    ).rejects.toThrow(/operator handshake write failed/);

    expect(files.has(lockPath)).toBe(false);

    const statusFiles = [...files.keys()].filter((path) =>
      path.endsWith("capture-run-status.json"),
    );
    expect(statusFiles).toHaveLength(1);
    const status = parseCaptureRunStatus(files.get(statusFiles[0]!) ?? "");
    expect(status?.state).toBe("failed");
    expect(status?.failureReason).toMatch(/operator handshake write failed/);
  });
});
