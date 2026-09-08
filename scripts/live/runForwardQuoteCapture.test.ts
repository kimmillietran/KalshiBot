import { describe, expect, it, vi } from "vitest";

import {
  resetForwardCaptureShutdown,
  runForwardQuoteCaptureCommand,
} from "./runForwardQuoteCapture";
import {
  DEFAULT_DIRECT_CAPTURE_PROGRESS_INTERVAL_MS,
  parseForwardQuoteCaptureConfigFromArgv,
  parseForwardQuoteCaptureProgressOptionsFromArgv,
  type ForwardQuoteCaptureProgressMonitorOptions,
} from "./runForwardQuoteCaptureTypes";

vi.mock("@/lib/data/live/forwardQuoteCapture", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/data/live/forwardQuoteCapture")>();
  return {
    ...actual,
    runForwardQuoteCapture: vi.fn(actual.runForwardQuoteCapture),
  };
});

import { runForwardQuoteCapture } from "@/lib/data/live/forwardQuoteCapture";

describe("parseForwardQuoteCaptureConfigFromArgv", () => {
  it("parses duration-minutes and capture-btc-spot", () => {
    const config = parseForwardQuoteCaptureConfigFromArgv([
      "--series",
      "KXBTC15M",
      "--duration-minutes",
      "5",
      "--max-markets",
      "2",
      "--capture-btc-spot",
      "--dry-run",
    ]);

    expect(config.durationMinutes).toBe(5);
    expect(config.maxMarkets).toBe(2);
    expect(config.captureBtcSpot).toBe(true);
    expect(config.captureBtcCandles1m).toBe(false);
    expect(config.dryRun).toBe(true);
  });

  it("defaults capture-btc-candles-1m to false and enables it only via explicit flag", () => {
    expect(parseForwardQuoteCaptureConfigFromArgv([]).captureBtcCandles1m).toBe(false);
    expect(
      parseForwardQuoteCaptureConfigFromArgv(["--capture-btc-candles-1m"]).captureBtcCandles1m,
    ).toBe(true);
  });
});

describe("runForwardQuoteCaptureCommand", () => {
  it("CLI smoke test dry-run writes artifacts", async () => {
    resetForwardCaptureShutdown();
    const written: Record<string, string> = {};
    const stdout: string[] = [];

    const exitCode = await runForwardQuoteCaptureCommand(
      [
        "--dry-run",
        "--series",
        "KXBTC15M",
        "--duration-minutes",
        "1",
        "--max-markets",
        "1",
        "--capture-btc-spot",
        "--output-dir",
        "out/capture",
        "--html-output",
        "out/report.html",
      ],
      {
        writeStdout: (text) => stdout.push(text),
        writeStderr: () => {},
        writeFile: (path, data) => {
          written[path] = data;
        },
        appendFile: (path, data) => {
          written[path] = (written[path] ?? "") + data;
        },
        mkdirSync: () => {},
      },
    );

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("dry-run-ok");
    expect(written["out/report.html"]).toContain("Capture infrastructure only");
  });

  it("emits capture-started JSON before the capture promise resolves", async () => {
    resetForwardCaptureShutdown();
    const stdout: string[] = [];
    let resolveCapture!: (value: never) => void;
    const captureGate = new Promise<never>((resolve) => {
      resolveCapture = resolve;
    });

    vi.mocked(runForwardQuoteCapture).mockImplementationOnce(async (input) => {
      input.onRunStarted?.({
        runId: "startup-run",
        outputDir: "out/capture",
        runDir: "out/capture/startup-run",
        startedAt: "2026-08-03T12:00:00.000Z",
      });
      await captureGate;
      return {
        runId: "startup-run",
        htmlOutputPath: "out/report.html",
        healthReport: {
          verdict: "dry-run-ok",
          recommendedNextAction: "none",
          credentialStatus: "dry-run",
          marketDiscovery: { marketsSubscribed: 1 },
          capture: {
            rawMessageCount: 1,
            topOfBookRecordCount: 1,
            btcSpotRecordCount: 0,
          },
          orderbook: { sequenceGapCount: 0 },
          connection: {
            reconnectCount: 0,
            captureEndReason: "duration-complete",
            terminalFailureReason: null,
            completedNormally: true,
            liveConnectionSucceeded: false,
          },
          errors: [],
        },
      } as never;
    });

    const commandPromise = runForwardQuoteCaptureCommand(
      [
        "--dry-run",
        "--series",
        "KXBTC15M",
        "--duration-minutes",
        "1",
        "--max-markets",
        "1",
        "--output-dir",
        "out/capture",
        "--html-output",
        "out/report.html",
      ],
      {
        writeStdout: (text) => stdout.push(text),
        writeStderr: () => {},
        writeFile: () => {},
        appendFile: () => {},
        mkdirSync: () => {},
      },
    );

    await vi.waitFor(() => {
      expect(stdout.join("")).toContain('"event":"capture-started"');
    });

    const startupText = stdout.join("");
    expect(startupText.endsWith("\n")).toBe(true);
    const startupLine = startupText.trim().split(/\r?\n/).at(-1)!;
    const startup = JSON.parse(startupLine) as Record<string, unknown>;
    expect(startup).toMatchObject({
      event: "capture-started",
      runId: "startup-run",
      outputDir: "out/capture",
      runDir: "out/capture/startup-run",
    });
    expect(startupText).not.toContain("dry-run-ok");

    resolveCapture(undefined as never);
    const exitCode = await commandPromise;
    expect(exitCode).toBe(0);

    const lines = stdout.join("").trim().split(/\r?\n/);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const final = JSON.parse(lines.at(-1)!) as Record<string, unknown>;
    expect(final.runId).toBe("startup-run");
    expect(final.outputDir).toBe("out/capture");
    expect(final.verdict).toBe("dry-run-ok");
    expect(final).not.toHaveProperty("event");
  });

  it("dry-run startup and final identities match", async () => {
    resetForwardCaptureShutdown();
    const stdout: string[] = [];
    const exitCode = await runForwardQuoteCaptureCommand(
      [
        "--dry-run",
        "--series",
        "KXBTC15M",
        "--duration-minutes",
        "1",
        "--max-markets",
        "1",
        "--output-dir",
        "out/capture",
        "--html-output",
        "out/report.html",
      ],
      {
        writeStdout: (text) => stdout.push(text),
        writeStderr: () => {},
        writeFile: () => {},
        appendFile: () => {},
        mkdirSync: () => {},
      },
    );

    expect(exitCode).toBe(0);
    const lines = stdout
      .join("")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("{"));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const startup = JSON.parse(lines[0]!) as Record<string, unknown>;
    const final = JSON.parse(lines.at(-1)!) as Record<string, unknown>;
    expect(startup.event).toBe("capture-started");
    expect(startup.runId).toBe(final.runId);
    expect(startup.outputDir).toBe(final.outputDir);
    expect(String(startup.runDir)).toContain(String(startup.runId));
  });

  it("returns exit code 1 when a stream fails only during finalization end()", async () => {
    resetForwardCaptureShutdown();
    const written: Record<string, string> = {};
    const stdout: string[] = [];

    const exitCode = await runForwardQuoteCaptureCommand(
      [
        "--dry-run",
        "--series",
        "KXBTC15M",
        "--duration-minutes",
        "1",
        "--max-markets",
        "1",
        "--output-dir",
        "out/capture",
        "--html-output",
        "out/report.html",
      ],
      {
        writeStdout: (text) => stdout.push(text),
        writeStderr: () => {},
        writeFile: (path, data) => {
          written[path] = data;
        },
        appendFile: (path, data) => {
          written[path] = (written[path] ?? "") + data;
        },
        mkdirSync: () => {},
        createAppendStream: (path) => ({
          write: () => true,
          onceDrain: () => {},
          onError: () => {},
          end: () =>
            path.endsWith("raw-kalshi-ws.jsonl")
              ? Promise.reject(new Error("EIO: flush failed during close"))
              : Promise.resolve(),
        }),
      },
    );

    // The capture itself succeeded; only stream close/flush failed. The
    // process exit code must still report failure.
    expect(exitCode).toBe(1);
    const output = stdout.join("");
    expect(output).toContain("writer-failure");
    expect(output).toContain("capture-writer-failure");
  });

  it("returns exit code 1 with runId JSON for an authentication-failure capture", async () => {
    resetForwardCaptureShutdown();
    vi.mocked(runForwardQuoteCapture).mockResolvedValueOnce({
      runId: "2026-07-21T23-37-23-813Z",
      htmlOutputPath: "out/report.html",
      healthReport: {
        verdict: "blocked-ws-auth",
        recommendedNextAction: "fix-credentials-and-retry",
        credentialStatus: "available",
        marketDiscovery: { marketsSubscribed: 1 },
        capture: {
          rawMessageCount: 0,
          topOfBookRecordCount: 0,
          btcSpotRecordCount: 0,
        },
        orderbook: { sequenceGapCount: 0 },
        connection: {
          reconnectCount: 0,
          captureEndReason: "authentication-failure",
          terminalFailureReason: null,
          completedNormally: false,
          liveConnectionSucceeded: false,
        },
        errors: ["Unexpected server response: 401"],
      },
    } as never);

    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runForwardQuoteCaptureCommand(
      [
        "--series",
        "KXBTC15M",
        "--duration-minutes",
        "20",
        "--max-markets",
        "5",
        "--capture-btc-spot",
        "--output-dir",
        "data/live-capture/forward-quotes",
      ],
      {
        writeStdout: (text) => stdout.push(text),
        writeStderr: (text) => stderr.push(text),
        writeFile: () => {},
        appendFile: () => {},
        mkdirSync: () => {},
      },
    );

    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout.join("")) as Record<string, unknown>;
    expect(parsed.runId).toBe("2026-07-21T23-37-23-813Z");
    expect(parsed.outputDir).toBe("data/live-capture/forward-quotes");
    expect(parsed.captureEndReason).toBe("authentication-failure");
    expect(parsed.verdict).not.toBe("capture-mvp-success");
    expect(stderr.join("")).not.toContain("mock-private-key");
    expect(stdout.join("")).not.toContain("mock-private-key");
  });
});

const STARTED_AT = "2026-09-07T16:42:00.000Z";

function successfulCaptureResult(runId: string) {
  return {
    runId,
    htmlOutputPath: "out/report.html",
    healthReport: {
      verdict: "dry-run-ok",
      recommendedNextAction: "none",
      credentialStatus: "dry-run",
      marketDiscovery: { marketsSubscribed: 1 },
      capture: {
        rawMessageCount: 1,
        topOfBookRecordCount: 1,
        btcSpotRecordCount: 0,
      },
      orderbook: { sequenceGapCount: 0 },
      connection: {
        reconnectCount: 0,
        captureEndReason: "duration-complete",
        terminalFailureReason: null,
        completedNormally: true,
        liveConnectionSucceeded: false,
      },
      errors: [],
    },
  } as never;
}

function createFakeProgressMonitor() {
  const starts: ForwardQuoteCaptureProgressMonitorOptions[] = [];
  let stopCount = 0;
  return {
    starts,
    get stopCount() {
      return stopCount;
    },
    startProgressMonitor: (options: ForwardQuoteCaptureProgressMonitorOptions) => {
      starts.push(options);
      options.writeLine(
        `[16:42:00] 0% | run ${options.runId} | elapsed 0m | remaining ${options.durationMinutes}m | topOfBook 0`,
      );
      return {
        stop: () => {
          stopCount += 1;
        },
      };
    },
  };
}

function extractJsonLines(stdout: string): Record<string, unknown>[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("parseForwardQuoteCaptureProgressOptionsFromArgv", () => {
  it("enables native progress by default at 10_000 ms", () => {
    const options = parseForwardQuoteCaptureProgressOptionsFromArgv([]);
    expect(options.enabled).toBe(true);
    expect(options.intervalMs).toBe(DEFAULT_DIRECT_CAPTURE_PROGRESS_INTERVAL_MS);
    expect(options.intervalMs).toBe(10_000);
  });

  it("disables progress with --no-progress", () => {
    expect(parseForwardQuoteCaptureProgressOptionsFromArgv(["--no-progress"])).toEqual({
      enabled: false,
      intervalMs: 10_000,
    });
  });

  it("accepts an explicit interval", () => {
    expect(
      parseForwardQuoteCaptureProgressOptionsFromArgv([
        "--progress-interval-ms",
        "2500",
      ]),
    ).toEqual({ enabled: true, intervalMs: 2500 });
  });

  it("rejects intervals below 1_000 and non-finite values", () => {
    for (const value of ["999", "0", "-1", "NaN", "Infinity", "-Infinity"]) {
      expect(() =>
        parseForwardQuoteCaptureProgressOptionsFromArgv([
          "--progress-interval-ms",
          value,
        ]),
      ).toThrow(/progress-interval-ms must be a finite number >= 1000/);
    }
  });

  it("does not add progress fields to ForwardQuoteCaptureConfig", () => {
    const config = parseForwardQuoteCaptureConfigFromArgv([
      "--no-progress",
      "--progress-interval-ms",
      "10000",
    ]);
    expect(config).not.toHaveProperty("enabled");
    expect(config).not.toHaveProperty("intervalMs");
    expect(config).not.toHaveProperty("progress");
    expect(config.captureBtcCandles1m).toBe(false);
  });
});

describe("native direct capture progress", () => {
  const identity = {
    runId: "2026-09-07T16-42-00-000Z",
    outputDir: "out/capture",
    runDir: "out/capture/2026-09-07T16-42-00-000Z",
    startedAt: STARTED_AT,
  };

  it("starts progress only after the exact onRunStarted handshake", async () => {
    resetForwardCaptureShutdown();
    const monitor = createFakeProgressMonitor();
    const stdout: string[] = [];
    const stderr: string[] = [];

    vi.mocked(runForwardQuoteCapture).mockImplementationOnce(async (input) => {
      expect(monitor.starts).toHaveLength(0);
      input.onRunStarted?.(identity);
      expect(monitor.starts).toHaveLength(1);
      expect(monitor.starts[0]).toMatchObject({
        runId: identity.runId,
        runDir: identity.runDir,
        startedAt: identity.startedAt,
        durationMinutes: 8,
        intervalMs: 10_000,
        includeBtcSpot: true,
        includeBtcCandles1m: true,
      });
      return successfulCaptureResult(identity.runId);
    });

    const exitCode = await runForwardQuoteCaptureCommand(
      [
        "--series",
        "KXBTC15M",
        "--duration-minutes",
        "8",
        "--max-markets",
        "3",
        "--capture-btc-spot",
        "--capture-btc-candles-1m",
        "--output-dir",
        "out/capture",
      ],
      {
        writeStdout: (text) => stdout.push(text),
        writeStderr: (text) => stderr.push(text),
        writeFile: () => {},
        appendFile: () => {},
        mkdirSync: () => {},
        startProgressMonitor: monitor.startProgressMonitor,
      },
    );

    expect(exitCode).toBe(0);
    expect(monitor.stopCount).toBe(1);

    const jsonLines = extractJsonLines(stdout.join(""));
    expect(jsonLines[0]).toMatchObject({
      event: "capture-started",
      runId: identity.runId,
      runDir: identity.runDir,
    });
    expect(jsonLines.at(-1)).toMatchObject({
      runId: identity.runId,
      verdict: "dry-run-ok",
    });
    expect(stdout.join("")).not.toContain("topOfBook 0");
    expect(stdout.join("")).not.toContain("elapsed 0m");
    expect(stdout.join("")).not.toContain("[16:42:00]");
    expect(stderr.join("")).toContain(`run ${identity.runId}`);
    expect(stderr.join("")).toContain("topOfBook 0");
    expect(stderr.join("")).toContain("[16:42:00]");
  });

  it("passes candle-enabled=false when the sidecar flag is absent", async () => {
    resetForwardCaptureShutdown();
    const monitor = createFakeProgressMonitor();

    vi.mocked(runForwardQuoteCapture).mockImplementationOnce(async (input) => {
      input.onRunStarted?.(identity);
      return successfulCaptureResult(identity.runId);
    });

    await runForwardQuoteCaptureCommand(
      ["--duration-minutes", "8", "--output-dir", "out/capture"],
      {
        writeStdout: () => {},
        writeStderr: () => {},
        writeFile: () => {},
        appendFile: () => {},
        mkdirSync: () => {},
        startProgressMonitor: monitor.startProgressMonitor,
      },
    );

    expect(monitor.starts[0]?.includeBtcCandles1m).toBe(false);
    expect(monitor.starts[0]?.includeBtcSpot).toBe(false);
    expect(monitor.starts[0]?.durationMinutes).toBe(8);
  });

  it("does not start progress when --no-progress is set", async () => {
    resetForwardCaptureShutdown();
    const monitor = createFakeProgressMonitor();

    vi.mocked(runForwardQuoteCapture).mockImplementationOnce(async (input) => {
      input.onRunStarted?.(identity);
      return successfulCaptureResult(identity.runId);
    });

    const exitCode = await runForwardQuoteCaptureCommand(
      ["--no-progress", "--duration-minutes", "8"],
      {
        writeStdout: () => {},
        writeStderr: () => {},
        writeFile: () => {},
        appendFile: () => {},
        mkdirSync: () => {},
        startProgressMonitor: monitor.startProgressMonitor,
      },
    );

    expect(exitCode).toBe(0);
    expect(monitor.starts).toHaveLength(0);
    expect(monitor.stopCount).toBe(0);
  });

  it("uses an explicit --progress-interval-ms", async () => {
    resetForwardCaptureShutdown();
    const monitor = createFakeProgressMonitor();

    vi.mocked(runForwardQuoteCapture).mockImplementationOnce(async (input) => {
      input.onRunStarted?.(identity);
      return successfulCaptureResult(identity.runId);
    });

    await runForwardQuoteCaptureCommand(
      ["--progress-interval-ms", "2500", "--duration-minutes", "8"],
      {
        writeStdout: () => {},
        writeStderr: () => {},
        writeFile: () => {},
        appendFile: () => {},
        mkdirSync: () => {},
        startProgressMonitor: monitor.startProgressMonitor,
      },
    );

    expect(monitor.starts[0]?.intervalMs).toBe(2500);
  });

  it("stops progress after a terminal capture failure", async () => {
    resetForwardCaptureShutdown();
    const monitor = createFakeProgressMonitor();

    vi.mocked(runForwardQuoteCapture).mockImplementationOnce(async (input) => {
      input.onRunStarted?.(identity);
      return {
        runId: identity.runId,
        htmlOutputPath: "out/report.html",
        healthReport: {
          verdict: "blocked-ws-auth",
          recommendedNextAction: "fix-credentials-and-retry",
          credentialStatus: "available",
          marketDiscovery: { marketsSubscribed: 1 },
          capture: {
            rawMessageCount: 0,
            topOfBookRecordCount: 0,
            btcSpotRecordCount: 0,
          },
          orderbook: { sequenceGapCount: 0 },
          connection: {
            reconnectCount: 0,
            captureEndReason: "authentication-failure",
            terminalFailureReason: null,
            completedNormally: false,
            liveConnectionSucceeded: false,
          },
          errors: ["Unexpected server response: 401"],
        },
      } as never;
    });

    const exitCode = await runForwardQuoteCaptureCommand(
      ["--duration-minutes", "8"],
      {
        writeStdout: () => {},
        writeStderr: () => {},
        writeFile: () => {},
        appendFile: () => {},
        mkdirSync: () => {},
        startProgressMonitor: monitor.startProgressMonitor,
      },
    );

    expect(exitCode).toBe(1);
    expect(monitor.starts).toHaveLength(1);
    expect(monitor.stopCount).toBe(1);
  });

  it("stops progress after a thrown command error", async () => {
    resetForwardCaptureShutdown();
    const monitor = createFakeProgressMonitor();

    vi.mocked(runForwardQuoteCapture).mockImplementationOnce(async (input) => {
      input.onRunStarted?.(identity);
      throw new Error("unexpected capture boom");
    });

    const exitCode = await runForwardQuoteCaptureCommand(
      ["--duration-minutes", "8"],
      {
        writeStdout: () => {},
        writeStderr: () => {},
        writeFile: () => {},
        appendFile: () => {},
        mkdirSync: () => {},
        startProgressMonitor: monitor.startProgressMonitor,
      },
    );

    expect(exitCode).toBe(1);
    expect(monitor.stopCount).toBe(1);
  });

  it("does not kill capture when progress startup fails", async () => {
    resetForwardCaptureShutdown();
    const stdout: string[] = [];

    vi.mocked(runForwardQuoteCapture).mockImplementationOnce(async (input) => {
      input.onRunStarted?.(identity);
      return successfulCaptureResult(identity.runId);
    });

    const exitCode = await runForwardQuoteCaptureCommand(
      ["--duration-minutes", "8", "--output-dir", "out/capture"],
      {
        writeStdout: (text) => stdout.push(text),
        writeStderr: () => {},
        writeFile: () => {},
        appendFile: () => {},
        mkdirSync: () => {},
        startProgressMonitor: () => {
          throw new Error("progress monitor exploded");
        },
      },
    );

    expect(exitCode).toBe(0);
    const jsonLines = extractJsonLines(stdout.join(""));
    expect(jsonLines[0]?.event).toBe("capture-started");
    expect(jsonLines.at(-1)?.runId).toBe(identity.runId);
  });

  it("rejects an invalid progress interval before capture starts", async () => {
    resetForwardCaptureShutdown();
    vi.mocked(runForwardQuoteCapture).mockClear();
    const stderr: string[] = [];

    const exitCode = await runForwardQuoteCaptureCommand(
      ["--progress-interval-ms", "0"],
      {
        writeStdout: () => {},
        writeStderr: (text) => stderr.push(text),
        writeFile: () => {},
        appendFile: () => {},
        mkdirSync: () => {},
        startProgressMonitor: () => {
          throw new Error("should not start");
        },
      },
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/progress-interval-ms must be a finite number >= 1000/);
    expect(vi.mocked(runForwardQuoteCapture)).not.toHaveBeenCalled();
  });
});
