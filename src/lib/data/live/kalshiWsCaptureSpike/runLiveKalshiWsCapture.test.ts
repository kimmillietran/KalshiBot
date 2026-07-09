import { describe, expect, it, vi } from "vitest";

import type { KalshiWsTransport } from "@/features/market-data/orderbook/types";

import * as kalshiAuthHeaders from "./kalshiAuthHeaders";
import { runLiveKalshiWsCapture } from "./runLiveKalshiWsCapture";

class RecordingWsTransport implements KalshiWsTransport {
  readonly sent: string[] = [];
  connectHeaders: Record<string, string> | undefined;
  private onMessageHandler: ((payload: string) => void) | null = null;

  async connect(_url: string, options?: { headers?: Record<string, string> }): Promise<void> {
    this.connectHeaders = options?.headers;
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {}

  onOpen(): void {}

  onMessage(handler: (payload: string) => void): void {
    this.onMessageHandler = handler;
  }

  onClose(): void {}

  onError(): void {}

  emit(payload: string): void {
    this.onMessageHandler?.(payload);
  }
}

const FIXED_NOW = new Date("2026-07-08T12:00:00.000Z");
const PEM = `-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----`;

describe("runLiveKalshiWsCapture", () => {
  it("generates auth headers and passes them to transport connect", async () => {
    vi.spyOn(kalshiAuthHeaders, "createKalshiWebSocketAuthHeaders").mockReturnValue({
      "KALSHI-ACCESS-KEY": "key-id",
      "KALSHI-ACCESS-TIMESTAMP": String(FIXED_NOW.getTime()),
      "KALSHI-ACCESS-SIGNATURE": "mock-signature",
    });

    const transport = new RecordingWsTransport();

    const result = await runLiveKalshiWsCapture({
      runId: "run",
      config: {
        series: "KXBTC15M",
        durationSeconds: 0,
        maxMarkets: 1,
        outputDir: "data/live-capture/kalshi-ws-spike",
        dryRun: false,
        captureBtcSpot: false,
        restSnapshotIntervalSeconds: null,
        mockInput: false,
      },
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
      credentials: {
        status: "available",
        apiKeyId: "key-id",
        apiBaseUrl: null,
        wsUrl: "wss://example.test/ws",
        privateKeyMaterial: {
          status: "loaded",
          source: "raw-env",
          privateKeyPem: PEM,
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
      },
      io: {
        writeFile: () => {},
        appendFile: () => {},
        mkdirSync: () => {},
        now: () => FIXED_NOW,
        monotonicNowMs: () => 1,
      },
      transport,
    });

    expect(result.authHeadersGenerated).toBe(true);
    expect(result.connected).toBe(true);
    expect(transport.connectHeaders?.["KALSHI-ACCESS-KEY"]).toBe("key-id");
    expect(transport.connectHeaders?.["KALSHI-ACCESS-TIMESTAMP"]).toBe(String(FIXED_NOW.getTime()));
    expect(transport.connectHeaders?.["KALSHI-ACCESS-SIGNATURE"]).toBe("mock-signature");
    expect(transport.sent.length).toBeGreaterThan(0);

    vi.restoreAllMocks();
  });

  it("reports blocked auth when headers cannot be generated", async () => {
    const transport = new RecordingWsTransport();

    const result = await runLiveKalshiWsCapture({
      runId: "run",
      config: {
        series: "KXBTC15M",
        durationSeconds: 0,
        maxMarkets: 1,
        outputDir: "data/live-capture/kalshi-ws-spike",
        dryRun: false,
        captureBtcSpot: false,
        restSnapshotIntervalSeconds: null,
        mockInput: false,
      },
      discovery: {
        attempted: true,
        succeeded: true,
        seriesTicker: "KXBTC15M",
        discoveredMarketCount: 1,
        selectedMarketTickers: ["KXBTC15M-TEST"],
        marketStatuses: {},
        eventTickers: {},
        closeTimes: {},
        error: null,
      },
      credentials: {
        status: "missing",
        apiKeyId: null,
        apiBaseUrl: null,
        wsUrl: null,
        privateKeyMaterial: {
          status: "missing",
          source: "missing",
          privateKeyPem: null,
          privateKeyLoaded: false,
          privateKeyFingerprint: null,
          warnings: [],
          error: null,
        },
        privateKeySource: "missing",
        privateKeyLoaded: false,
        privateKeyFingerprint: null,
        keyIdPresent: false,
        warnings: [],
        error: null,
      },
      io: {
        writeFile: () => {},
        appendFile: () => {},
        mkdirSync: () => {},
        now: () => new Date(),
        monotonicNowMs: () => 1,
      },
      transport,
    });

    expect(result.authHeadersGenerated).toBe(false);
    expect(result.connected).toBe(false);
    expect(result.errors[0]).toContain("Authenticated WebSocket headers");
  });
});
