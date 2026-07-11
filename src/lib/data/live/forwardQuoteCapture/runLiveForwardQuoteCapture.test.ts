import { describe, expect, it, vi } from "vitest";

import type { KalshiWsProbeTransport } from "@/features/market-data/orderbook/types";
import type { KalshiCaptureCredentials } from "@/lib/data/live/kalshiWsCaptureSpike";

import { runLiveForwardQuoteCapture } from "./runLiveForwardQuoteCapture";
import type { ForwardQuoteCaptureConfig } from "./forwardQuoteCaptureTypes";

vi.mock("@/lib/data/live/kalshiWsCaptureSpike", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/data/live/kalshiWsCaptureSpike")>();

  return {
    ...actual,
    createKalshiWebSocketAuthHeaders: vi.fn(() => ({
      "KALSHI-ACCESS-KEY": "key-id",
      "KALSHI-ACCESS-TIMESTAMP": "0",
      "KALSHI-ACCESS-SIGNATURE": "mock-signature",
    })),
  };
});

const LIVE_CONFIG: ForwardQuoteCaptureConfig = {
  series: "KXBTC15M",
  durationMinutes: 0.0001,
  maxMarkets: 1,
  outputDir: "data/live-capture/forward-quotes",
  dryRun: false,
  captureBtcSpot: false,
  rolloverCheckSeconds: 30,
  healthFlushSeconds: 60,
  topOfBookThrottleMs: 0,
  wsWatchdogEnabled: true,
  wsSoftSilenceThresholdMs: 30_000,
  wsHardStallThresholdMs: 60_000,
  wsProbeGraceMs: 10_000,
  wsRecoveryMaxAttempts: 1,
};

const CREDENTIALS: KalshiCaptureCredentials = {
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
};

class AckOnlyRecoveryTransport implements KalshiWsProbeTransport {
  connectCount = 0;
  sentAckAfterReconnect = false;
  private closedInitialConnection = false;
  private onMessageHandler: ((payload: string) => void) | null = null;
  private onCloseHandler: ((code?: number, reason?: string) => void) | null = null;

  async connect(): Promise<void> {
    this.connectCount += 1;
  }

  send(): void {
    if (this.connectCount === 1 && !this.closedInitialConnection) {
      this.closedInitialConnection = true;
      this.onCloseHandler?.(1006, "stalled socket");
      return;
    }

    if (this.connectCount === 2 && !this.sentAckAfterReconnect) {
      this.sentAckAfterReconnect = true;
      this.onMessageHandler?.(
        JSON.stringify({
          type: "subscribed",
          sid: 1,
          msg: { channel: "orderbook_delta" },
        }),
      );
    }
  }

  close(): void {}

  onOpen(): void {}

  onMessage(handler: (payload: string) => void): void {
    this.onMessageHandler = handler;
  }

  onClose(handler: (code?: number, reason?: string) => void): void {
    this.onCloseHandler = handler;
  }

  onError(): void {}

  ping(): void {}

  onPong(): void {}
}

describe("runLiveForwardQuoteCapture recovery confirmation", () => {
  it("does not mark recovery successful from a subscribe/control message only", async () => {
    const transport = new AckOnlyRecoveryTransport();
    let monotonicMs = 0;

    const result = await runLiveForwardQuoteCapture({
      runId: "run-ack-only",
      startedAt: "2026-07-11T00:00:00.000Z",
      config: LIVE_CONFIG,
      discovery: {
        attempted: true,
        succeeded: true,
        seriesTicker: "KXBTC15M",
        discoveredMarketCount: 1,
        selectedMarketTickers: ["KXBTC15M-TEST"],
        marketStatuses: { "KXBTC15M-TEST": "open" },
        eventTickers: { "KXBTC15M-TEST": null },
        closeTimes: { "KXBTC15M-TEST": null },
        error: null,
      },
      credentials: CREDENTIALS,
      io: {
        writeFile: () => {},
        appendFile: () => {},
        mkdirSync: () => {},
        now: () => new Date(Date.UTC(2026, 6, 11) + monotonicMs),
        monotonicNowMs: () => {
          monotonicMs += 1_000;
          return monotonicMs;
        },
      },
      transport,
    });

    expect(transport.connectCount).toBe(2);
    expect(transport.sentAckAfterReconnect).toBe(true);
    expect(result.processor.diagnostics.rawMessageCount).toBe(1);
    expect(result.processor.diagnostics.snapshotsReceived).toBe(0);
    expect(result.watchdog?.wsRecoverySuccessCount).toBe(0);
    expect(result.watchdog?.wsRecoveryFailureCount).toBe(1);
    expect(result.watchdog?.terminalWebSocketFailure).toBe(true);
    expect(
      result.watchdog?.lifecycleEvents.some((event) => event.type === "wsRecoverySucceeded"),
    ).toBe(false);
  }, 10_000);
});
