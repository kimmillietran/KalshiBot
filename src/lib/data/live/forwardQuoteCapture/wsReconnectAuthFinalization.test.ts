import { beforeEach, describe, expect, it, vi } from "vitest";

import type { KalshiWsProbeTransport } from "@/features/market-data/orderbook/types";
import { KalshiWsHandshakeError } from "@/lib/data/live/kalshiWsCaptureSpike";

import { parseCaptureRunStatus } from "./captureRunStatus";
import { resolveCaptureLockPath } from "./captureLock";
import { runForwardQuoteCapture } from "./runForwardQuoteCapture";
import type {
  ForwardQuoteCaptureConfig,
  ForwardQuoteCaptureIo,
} from "./forwardQuoteCaptureTypes";
import { ReconnectScriptedTransport } from "./wsReconnectAcceptance/reconnectScriptedTransport";

const authHeaderMock = vi.hoisted(() => {
  let generation = 0;
  let throwOnGeneration: number | null = null;
  return {
    reset() {
      generation = 0;
      throwOnGeneration = null;
    },
    throwOn(generationNumber: number) {
      throwOnGeneration = generationNumber;
    },
    create: vi.fn((input: { apiKeyId: string; timestampMs?: string }) => {
      generation += 1;
      if (throwOnGeneration !== null && generation === throwOnGeneration) {
        throw new Error("scripted auth header generation failure");
      }
      const timestamp = input.timestampMs ?? String(generation * 1_000);
      return {
        "KALSHI-ACCESS-KEY": input.apiKeyId,
        "KALSHI-ACCESS-TIMESTAMP": timestamp,
        "KALSHI-ACCESS-SIGNATURE": `mock-signature-gen-${generation}-${timestamp}`,
      };
    }),
    get generation() {
      return generation;
    },
  };
});

vi.mock("@/lib/data/live/kalshiWsCaptureSpike", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/data/live/kalshiWsCaptureSpike")>();

  return {
    ...actual,
    createKalshiWebSocketAuthHeaders: authHeaderMock.create,
    resolveKalshiCaptureCredentials: vi.fn(() => ({
      status: "available",
      apiKeyId: "key-id",
      apiBaseUrl: null,
      wsUrl: "wss://example.test/ws",
      privateKeyMaterial: {
        status: "loaded",
        source: "raw-env",
        privateKeyPem: "mock-private-key",
        privateKeyLoaded: true,
        privateKeyFingerprint: "abc",
        warnings: [],
        error: null,
      },
      privateKeySource: "raw-env",
      privateKeyLoaded: true,
      privateKeyFingerprint: "abc",
      keyIdPresent: true,
      warnings: [],
      error: null,
    })),
  };
});

vi.mock("./discoverCaptureMarkets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./discoverCaptureMarkets")>();
  return {
    ...actual,
    discoverCaptureMarkets: vi.fn(async () => ({
      attempted: true,
      succeeded: true,
      seriesTicker: "KXBTC15M",
      discoveredMarketCount: 1,
      selectedMarketTickers: ["KXBTC15M-RECONNECT-AUTH"],
      marketStatuses: { "KXBTC15M-RECONNECT-AUTH": "active" },
      eventTickers: { "KXBTC15M-RECONNECT-AUTH": null },
      closeTimes: { "KXBTC15M-RECONNECT-AUTH": null },
      error: null,
    })),
    discoverRolloverMarkets: vi.fn(async () => ({
      discovery: {
        attempted: true,
        succeeded: true,
        seriesTicker: "KXBTC15M",
        discoveredMarketCount: 1,
        selectedMarketTickers: ["KXBTC15M-RECONNECT-AUTH"],
        marketStatuses: { "KXBTC15M-RECONNECT-AUTH": "active" },
        eventTickers: { "KXBTC15M-RECONNECT-AUTH": null },
        closeTimes: { "KXBTC15M-RECONNECT-AUTH": null },
        error: null,
      },
      newTickers: [],
      closedTickers: [],
    })),
  };
});

const OUTPUT_DIR = "in-memory/reconnect-auth-finalization/forward-quotes";
const PRIMARY = "KXBTC15M-RECONNECT-AUTH";
const DURATION_MINUTES = 180;
const DURATION_MS = DURATION_MINUTES * 60_000;

const LIVE_CONFIG: ForwardQuoteCaptureConfig = {
  series: "KXBTC15M",
  durationMinutes: DURATION_MINUTES,
  maxMarkets: 1,
  outputDir: OUTPUT_DIR,
  dryRun: false,
  marketTicker: PRIMARY,
  captureBtcSpot: false,
  rolloverCheckSeconds: 30,
  healthFlushSeconds: 60,
  topOfBookThrottleMs: 0,
  wsWatchdogEnabled: true,
  wsSoftSilenceThresholdMs: 30_000,
  wsHardStallThresholdMs: 60_000,
  wsProbeGraceMs: 10_000,
  wsRecoveryMaxAttempts: 1,
  priceRepresentation: "legacy-no-leg",
};

function createMemoryIo() {
  const files = new Map<string, string>();
  const appended = new Map<string, string[]>();
  let nowMs = Date.UTC(2026, 6, 22);
  let monotonicMs = 0;
  const lockPath = resolveCaptureLockPath(OUTPUT_DIR);

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
      appended.set(path, [...(appended.get(path) ?? []), data]);
      files.set(path, `${files.get(path) ?? ""}${data}`);
    },
    createAppendStream: (path) => ({
      write(chunk) {
        appended.set(path, [...(appended.get(path) ?? []), chunk]);
        files.set(path, `${files.get(path) ?? ""}${chunk}`);
        return true;
      },
      onceDrain() {},
      onError() {},
      end() {
        return Promise.resolve();
      },
    }),
    renameFile: (from, to) => {
      const contents = files.get(from);
      if (contents === undefined) {
        throw new Error(`ENOENT rename: ${from}`);
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
    setInterval: (fn, ms) => {
      void fn;
      void ms;
      return 1;
    },
    clearInterval: () => {},
    fetchImpl: (async () =>
      new Response(JSON.stringify({ markets: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
  };

  return {
    io,
    files,
    appended,
    lockPath,
    advanceNowMs: (delta: number) => {
      nowMs += delta;
    },
    lifecycleText: () => {
      for (const [path, chunks] of appended) {
        if (path.endsWith("capture-lifecycle.jsonl")) {
          return chunks.join("");
        }
      }
      return "";
    },
  };
}

async function runWithProcessSafety<T>(
  fn: () => Promise<T>,
): Promise<{
  result: T;
  uncaughtExceptionCount: number;
  unhandledRejectionCount: number;
}> {
  let uncaughtExceptionCount = 0;
  let unhandledRejectionCount = 0;
  const onUncaught = (): void => {
    uncaughtExceptionCount += 1;
  };
  const onUnhandled = (): void => {
    unhandledRejectionCount += 1;
  };
  process.on("uncaughtException", onUncaught);
  process.on("unhandledRejection", onUnhandled);
  try {
    const result = await fn();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { result, uncaughtExceptionCount, unhandledRejectionCount };
  } finally {
    process.off("uncaughtException", onUncaught);
    process.off("unhandledRejection", onUnhandled);
  }
}

function createDurationJumpShouldStop(input: {
  advanceNowMs: (delta: number) => void;
  lifecycleText: () => string;
  successMarker?: string;
  failureMarker?: string;
}) {
  let pollCount = 0;
  let clockJumped = false;
  return () => {
    pollCount += 1;
    if (clockJumped) {
      return false;
    }
    const lifecycle = input.lifecycleText();
    const success =
      input.successMarker !== undefined && lifecycle.includes(input.successMarker);
    const failure =
      input.failureMarker !== undefined && lifecycle.includes(input.failureMarker);
    if (success) {
      clockJumped = true;
      input.advanceNowMs(DURATION_MS + 60_000);
    } else if (failure) {
      // Leave the duration clock alone so the capture loop can observe
      // watchdog.isTerminal and end with terminal-websocket-failure.
      clockJumped = true;
    } else if (pollCount >= 120) {
      clockJumped = true;
      input.advanceNowMs(DURATION_MS + 60_000);
    }
    return false;
  };
}

describe("wsReconnectAuthFinalization", () => {
  beforeEach(() => {
    authHeaderMock.reset();
  });

  it("rejects stale auth headers on reconnect and accepts fresh ones", async () => {
    const transcript: string[] = [];
    const transport = new ReconnectScriptedTransport({
      scenario: "reconnect-success",
      primaryMarketTicker: PRIMARY,
      transcript,
    });

    await transport.connect("wss://example.test/ws", {
      headers: {
        "KALSHI-ACCESS-KEY": "key-id",
        "KALSHI-ACCESS-TIMESTAMP": "1000",
        "KALSHI-ACCESS-SIGNATURE": "sig-a",
      },
    });

    await expect(
      transport.connect("wss://example.test/ws", {
        headers: {
          "KALSHI-ACCESS-KEY": "key-id",
          "KALSHI-ACCESS-TIMESTAMP": "1000",
          "KALSHI-ACCESS-SIGNATURE": "sig-a",
        },
      }),
    ).rejects.toThrow(/Stale WebSocket auth headers/);

    await transport.connect("wss://example.test/ws", {
      headers: {
        "KALSHI-ACCESS-KEY": "key-id",
        "KALSHI-ACCESS-TIMESTAMP": "2000",
        "KALSHI-ACCESS-SIGNATURE": "sig-b-fresh",
      },
    });

    expect(transport.connectAttempts).toHaveLength(3);
    expect(transport.connectAttempts[0]?.timestamp).not.toBe(
      transport.connectAttempts[2]?.timestamp,
    );
    expect(transport.connectAttempts[0]?.signature).not.toBe(
      transport.connectAttempts[2]?.signature,
    );
    expect(transcript.join("\n")).toContain("fresh auth headers");
  });

  it("contains reconnect 401 as terminal-websocket-failure without unhandledRejection", async () => {
    const transcript: string[] = [];
    const { io, files, lockPath, advanceNowMs, lifecycleText } = createMemoryIo();
    const transport = new ReconnectScriptedTransport({
      scenario: "reconnect-401-terminal",
      primaryMarketTicker: PRIMARY,
      transcript,
      onBeforeReconnectConnect: () => {
        advanceNowMs(56 * 60 * 1000);
      },
    });

    const { result, unhandledRejectionCount, uncaughtExceptionCount } =
      await runWithProcessSafety(() =>
        runForwardQuoteCapture({
          config: LIVE_CONFIG,
          io,
          htmlOutputPath: "in-memory/reconnect-auth-finalization/report.html",
          transport,
          forceReconnectAfterFirstValidTopOfBook: true,
          shouldStop: createDurationJumpShouldStop({
            advanceNowMs,
            lifecycleText,
            failureMarker: "wsRecoveryFailed",
          }),
          credentialEnv: {
            KALSHI_API_KEY_ID: "key-id",
            KALSHI_PRIVATE_KEY: "mock-private-key",
          },
        }),
      );

    expect(unhandledRejectionCount).toBe(0);
    expect(uncaughtExceptionCount).toBe(0);
    expect(result.healthReport.connection.captureEndReason).toBe(
      "terminal-websocket-failure",
    );
    expect(result.healthReport.watchdog?.terminalWebSocketFailure).toBe(true);
    expect(
      result.healthReport.connection.authHeaderGenerationCount,
    ).toBeGreaterThanOrEqual(2);
    expect(files.has(lockPath)).toBe(false);

    const status = parseCaptureRunStatus(
      files.get(`${OUTPUT_DIR}/${result.runId}/capture-run-status.json`)!,
    );
    expect(status?.state).toBe("failed");
    expect(status?.captureEndReason).toBe("terminal-websocket-failure");
    expect(transcript.join("\n")).toContain("HTTP 401");
    // Keep HandshakeError import exercised for type/compat with transport throws.
    expect(KalshiWsHandshakeError.name).toBe("KalshiWsHandshakeError");
  }, 45_000);

  it("generates fresh auth headers on each connection attempt during successful reconnect", async () => {
    const transcript: string[] = [];
    const { io, files, lockPath, advanceNowMs, lifecycleText } = createMemoryIo();
    const transport = new ReconnectScriptedTransport({
      scenario: "reconnect-success",
      primaryMarketTicker: PRIMARY,
      transcript,
      onBeforeReconnectConnect: () => {
        advanceNowMs(56 * 60 * 1000);
      },
    });

    const { result, unhandledRejectionCount } = await runWithProcessSafety(() =>
      runForwardQuoteCapture({
        config: LIVE_CONFIG,
        io,
        htmlOutputPath: "in-memory/reconnect-auth-finalization/report.html",
        transport,
        forceReconnectAfterFirstValidTopOfBook: true,
        shouldStop: createDurationJumpShouldStop({
          advanceNowMs,
          lifecycleText,
          successMarker: "wsRecoverySucceeded",
        }),
        credentialEnv: {
          KALSHI_API_KEY_ID: "key-id",
          KALSHI_PRIVATE_KEY: "mock-private-key",
        },
      }),
    );

    expect(unhandledRejectionCount).toBe(0);
    expect(authHeaderMock.generation).toBeGreaterThanOrEqual(2);
    expect(transport.connectAttempts.length).toBeGreaterThanOrEqual(2);
    expect(transport.connectAttempts[0]?.timestamp).not.toBe(
      transport.connectAttempts[1]?.timestamp,
    );
    expect(transport.connectAttempts[0]?.signature).not.toBe(
      transport.connectAttempts[1]?.signature,
    );
    expect(result.healthReport.watchdog?.wsRecoverySuccessCount).toBeGreaterThanOrEqual(
      1,
    );
    expect(result.healthReport.watchdog?.terminalWebSocketFailure).toBe(false);
    expect(result.healthReport.connection.captureEndReason).toBe("duration-complete");
    expect(result.healthReport.connection.authHeaderGenerationCount).toBeGreaterThanOrEqual(
      2,
    );
    expect(files.has(lockPath)).toBe(false);
  }, 45_000);

  it("contains auth generation throw on reconnect without unhandledRejection", async () => {
    authHeaderMock.throwOn(2);

    class AlwaysAcceptTransport implements KalshiWsProbeTransport {
      connectCount = 0;
      private onMessageHandler: ((payload: string) => void) | null = null;
      private nextSid = 1;

      async connect(): Promise<void> {
        this.connectCount += 1;
      }

      send(payload: string): void {
        const command = JSON.parse(payload) as Record<string, unknown>;
        const params = (command.params ?? {}) as Record<string, unknown>;
        if (command.cmd === "subscribe") {
          const ticker = (params.market_tickers as string[])[0]!;
          const sid = this.nextSid++;
          const emit = (msg: Record<string, unknown>) => {
            queueMicrotask(() => {
              this.onMessageHandler?.(JSON.stringify(msg));
            });
          };
          emit({
            id: command.id,
            type: "subscribed",
            msg: { channel: "orderbook_delta", sid },
          });
          emit({
            type: "orderbook_snapshot",
            sid,
            seq: this.connectCount === 1 ? 1 : 200,
            msg: {
              market_ticker: ticker,
              market_id: "id",
              yes_dollars_fp: [["0.4500", "100.00"]],
              no_dollars_fp: [["0.5000", "80.00"]],
            },
          });
        }
      }

      close(): void {}
      onOpen(): void {}
      onMessage(handler: (payload: string) => void): void {
        this.onMessageHandler = handler;
      }
      onClose(): void {}
      onError(): void {}
      ping(): void {}
      onPong(): void {}
    }

    const transport = new AlwaysAcceptTransport();
    const { io, files, lockPath, advanceNowMs, lifecycleText } = createMemoryIo();

    const { result, unhandledRejectionCount, uncaughtExceptionCount } =
      await runWithProcessSafety(() =>
        runForwardQuoteCapture({
          config: LIVE_CONFIG,
          io,
          htmlOutputPath: "in-memory/reconnect-auth-finalization/report.html",
          transport,
          forceReconnectAfterFirstValidTopOfBook: true,
          shouldStop: createDurationJumpShouldStop({
            advanceNowMs,
            lifecycleText,
            failureMarker: "wsRecoveryFailed",
          }),
          credentialEnv: {
            KALSHI_API_KEY_ID: "key-id",
            KALSHI_PRIVATE_KEY: "mock-private-key",
          },
        }),
      );

    expect(unhandledRejectionCount).toBe(0);
    expect(uncaughtExceptionCount).toBe(0);
    expect(authHeaderMock.generation).toBeGreaterThanOrEqual(2);
    expect(result.healthReport.connection.captureEndReason).toBe(
      "terminal-websocket-failure",
    );
    expect(result.healthReport.watchdog?.terminalWebSocketFailure).toBe(true);
    expect(files.has(lockPath)).toBe(false);
    expect(
      result.healthReport.errors.some((error) =>
        /auth|header|generation|failed/i.test(error),
      ),
    ).toBe(true);
  }, 45_000);

  it("succeeds on the second reconnect attempt after an initial 401", async () => {
    const transcript: string[] = [];
    const { io, files, lockPath, advanceNowMs, lifecycleText } = createMemoryIo();
    const transport = new ReconnectScriptedTransport({
      scenario: "second-attempt-success",
      primaryMarketTicker: PRIMARY,
      transcript,
      onBeforeReconnectConnect: () => {
        advanceNowMs(56 * 60 * 1000);
      },
    });

    const { result, unhandledRejectionCount } = await runWithProcessSafety(() =>
      runForwardQuoteCapture({
        config: { ...LIVE_CONFIG, wsRecoveryMaxAttempts: 2 },
        io,
        htmlOutputPath: "in-memory/reconnect-auth-finalization/report.html",
        transport,
        forceReconnectAfterFirstValidTopOfBook: true,
        shouldStop: createDurationJumpShouldStop({
          advanceNowMs,
          lifecycleText,
          successMarker: "wsRecoverySucceeded",
        }),
        credentialEnv: {
          KALSHI_API_KEY_ID: "key-id",
          KALSHI_PRIVATE_KEY: "mock-private-key",
        },
      }),
    );

    expect(unhandledRejectionCount).toBe(0);
    expect(transport.connectAttempts.length).toBeGreaterThanOrEqual(3);
    expect(authHeaderMock.generation).toBeGreaterThanOrEqual(3);
    expect(result.healthReport.watchdog?.wsRecoverySuccessCount).toBeGreaterThanOrEqual(
      1,
    );
    expect(transport.connectAttempts.length).toBeGreaterThanOrEqual(3);
    expect(result.healthReport.watchdog?.terminalWebSocketFailure).toBe(false);
    expect(result.healthReport.connection.captureEndReason).toBe("duration-complete");
    expect(files.has(lockPath)).toBe(false);
    expect(transcript.join("\n")).toContain("second reconnect attempt");
    expect(transcript.join("\n")).toContain("HTTP 401");
  }, 45_000);
});
