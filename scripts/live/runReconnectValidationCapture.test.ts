import { describe, expect, it, vi } from "vitest";

import {
  resetReconnectValidationShutdown,
  runReconnectValidationCaptureCommand,
} from "./runReconnectValidationCapture";
import { parseForwardQuoteCaptureConfigFromArgv } from "./runForwardQuoteCaptureTypes";

vi.mock("@/lib/data/live/forwardQuoteCapture", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/data/live/forwardQuoteCapture")>();
  return {
    ...actual,
    runForwardQuoteCapture: vi.fn(actual.runForwardQuoteCapture),
  };
});

import { runForwardQuoteCapture } from "@/lib/data/live/forwardQuoteCapture";

const mockedRun = vi.mocked(runForwardQuoteCapture);

function createIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const files = new Map<string, string>();
  const exclusiveCreates: string[] = [];
  return {
    stdout,
    stderr,
    files,
    exclusiveCreates,
    io: {
      writeStdout: (text: string) => {
        stdout.push(text);
      },
      writeStderr: (text: string) => {
        stderr.push(text);
      },
      writeFile: (path: string, data: string) => {
        files.set(path, data);
      },
      appendFile: (path: string, data: string) => {
        files.set(path, (files.get(path) ?? "") + data);
      },
      mkdirSync: () => {},
      createExclusiveFile: (path: string, data: string) => {
        exclusiveCreates.push(path);
        if (files.has(path)) {
          throw new Error(`EEXIST ${path}`);
        }
        files.set(path, data);
      },
      deleteFile: (path: string) => {
        files.delete(path);
      },
      readFile: (path: string) => {
        const data = files.get(path);
        if (data === undefined) {
          throw new Error(`ENOENT ${path}`);
        }
        return data;
      },
    },
  };
}

function mockCaptureResult(input: {
  captureEndReason: string | null;
  controlledSucceeded?: boolean;
  terminalFailureReason?: string | null;
}) {
  const controlledSucceeded = input.controlledSucceeded ?? true;
  return {
    runId: "run-1",
    controlledReconnectValidation: controlledSucceeded
      ? {
        enabled: true,
        requestCount: 1,
        acceptedRequestCount: 1,
        recoveryCycleId: 2,
        recoveryReason: "controlled-reconnect-validation",
        attemptCount: 1,
        succeeded: true,
        failed: false,
        failureReason: null,
      }
      : {
        enabled: true,
        requestCount: 1,
        acceptedRequestCount: 0,
        recoveryCycleId: null,
        recoveryReason: null,
        attemptCount: 0,
        succeeded: false,
        failed: true,
        failureReason: "controlled-reconnect-not-completed",
      },
    healthReport: {
      verdict: "capture-mvp-success",
      recommendedNextAction: "none",
      credentialStatus: "available",
      marketDiscovery: { marketsSubscribed: 1 },
      capture: { rawMessageCount: 1, topOfBookRecordCount: 1 },
      connection: {
        reconnectCount: 1,
        connectionAttemptCount: 2,
        authHeaderGenerationCount: 2,
        captureEndReason: input.captureEndReason,
        terminalFailureReason: input.terminalFailureReason ?? null,
      },
      watchdog: {
        wsRecoverySuccessCount: 1,
        wsRecoveryFailureCount: 0,
        terminalWebSocketFailure: false,
      },
    },
    htmlOutputPath: null,
  } as never;
}

const VALID_ARGV = [
  "--series",
  "KXBTC15M",
  "--duration-minutes",
  "15",
  "--max-markets",
  "3",
  "--capture-btc-spot",
  "--top-of-book-throttle-ms",
  "1000",
] as const;

describe("runReconnectValidationCaptureCommand", () => {
  it("accepts duration-complete + controlled success with exit 0", async () => {
    resetReconnectValidationShutdown();
    mockedRun.mockResolvedValueOnce(
      mockCaptureResult({ captureEndReason: "duration-complete" }),
    );

    const { io, stderr } = createIo();
    const exitCode = await runReconnectValidationCaptureCommand(
      [...VALID_ARGV],
      io,
    );

    expect(exitCode).toBe(0);
    expect(stderr.join("")).toBe("");
    expect(mockedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        forceReconnectAfterFirstValidTopOfBook: true,
        config: expect.objectContaining({
          wsWatchdogEnabled: true,
          durationMinutes: 15,
        }),
      }),
    );
  });

  it.each([
    ["writer-failure", 1],
    ["unexpected-error", 1],
    ["authentication-failure", 1],
    ["terminal-websocket-failure", 1],
    [null, 1],
  ] as const)(
    "returns 1 when end reason is %s even if controlled succeeded",
    async (endReason, expected) => {
      resetReconnectValidationShutdown();
      mockedRun.mockClear();
      mockedRun.mockResolvedValueOnce(
        mockCaptureResult({
          captureEndReason: endReason,
          controlledSucceeded: true,
        }),
      );
      const { io } = createIo();
      const exitCode = await runReconnectValidationCaptureCommand(
        [...VALID_ARGV],
        io,
      );
      expect(exitCode).toBe(expected);
    },
  );

  it("returns 130 for user-cancelled", async () => {
    resetReconnectValidationShutdown();
    mockedRun.mockClear();
    mockedRun.mockResolvedValueOnce(
      mockCaptureResult({
        captureEndReason: "user-cancelled",
        controlledSucceeded: true,
      }),
    );
    const { io } = createIo();
    const exitCode = await runReconnectValidationCaptureCommand(
      [...VALID_ARGV],
      io,
    );
    expect(exitCode).toBe(130);
  });

  it("returns 1 for duration-complete when controlled incomplete", async () => {
    resetReconnectValidationShutdown();
    mockedRun.mockClear();
    mockedRun.mockResolvedValueOnce(
      mockCaptureResult({
        captureEndReason: "duration-complete",
        controlledSucceeded: false,
      }),
    );
    const { io } = createIo();
    const exitCode = await runReconnectValidationCaptureCommand(
      [...VALID_ARGV],
      io,
    );
    expect(exitCode).toBe(1);
  });

  it.each([
    ["14", 14],
    ["21", 21],
    ["480", 480],
  ] as const)("rejects duration %s", async (_label, minutes) => {
    resetReconnectValidationShutdown();
    mockedRun.mockClear();
    const { io, stderr, exclusiveCreates } = createIo();
    const exitCode = await runReconnectValidationCaptureCommand(
      [
        "--series",
        "KXBTC15M",
        "--duration-minutes",
        String(minutes),
        "--max-markets",
        "3",
      ],
      io,
    );
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/15|20|eight-hour|duration/i);
    expect(mockedRun).not.toHaveBeenCalled();
    expect(exclusiveCreates).toEqual([]);
  });

  it("rejects --disable-ws-watchdog before capture startup", async () => {
    resetReconnectValidationShutdown();
    mockedRun.mockClear();
    const { io, stderr, exclusiveCreates, files } = createIo();
    const exitCode = await runReconnectValidationCaptureCommand(
      [
        "--series",
        "KXBTC15M",
        "--duration-minutes",
        "20",
        "--disable-ws-watchdog",
      ],
      io,
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/watchdog/i);
    expect(stderr.join("")).toMatch(/--disable-ws-watchdog/);
    expect(mockedRun).not.toHaveBeenCalled();
    expect(exclusiveCreates).toEqual([]);
    expect(files.size).toBe(0);
  });

  it("ordinary shared parser still accepts --disable-ws-watchdog", () => {
    const config = parseForwardQuoteCaptureConfigFromArgv([
      "--series",
      "KXBTC15M",
      "--duration-minutes",
      "480",
      "--disable-ws-watchdog",
    ]);
    expect(config.wsWatchdogEnabled).toBe(false);
    expect(config.durationMinutes).toBe(480);
  });
});
