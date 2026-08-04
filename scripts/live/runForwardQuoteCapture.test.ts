import { describe, expect, it, vi } from "vitest";

import {
  resetForwardCaptureShutdown,
  runForwardQuoteCaptureCommand,
} from "./runForwardQuoteCapture";
import {
  parseForwardQuoteCaptureConfigFromArgv,
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
    expect(config.dryRun).toBe(true);
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
