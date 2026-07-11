import { describe, expect, it } from "vitest";

import { buildForwardCaptureHealthReport, evaluateForwardCaptureVerdict } from "./buildForwardCaptureHealthReport";
import { createEmptyOrderbookDiagnostics } from "./createEmptyOrderbookDiagnostics";
import { discoverCaptureMarkets } from "./discoverCaptureMarkets";
import { ForwardCaptureMessageProcessor } from "./forwardCaptureMessageProcessor";
import { OrderbookCaptureBook } from "./orderbookCaptureBook";
import { createJsonlForwardCaptureWriter, createRunOutputPaths } from "./jsonlForwardCaptureWriter";
import { createMockForwardCaptureMessages } from "./mockForwardCaptureFeed";
import {
  redactCaptureArtifactText,
  resolveKalshiCaptureCredentials,
} from "@/lib/data/live/kalshiWsCaptureSpike";
import { assertForwardCaptureSafety } from "./forwardQuoteCaptureSafetyGuard";
import { runDryRunForwardQuoteCapture } from "./runDryRunForwardQuoteCapture";
import { runForwardQuoteCapture } from "./runForwardQuoteCapture";
import { serializeForwardQuoteCaptureHtml } from "./serializeForwardQuoteCaptureHtml";
import type { ForwardQuoteCaptureConfig } from "./forwardQuoteCaptureTypes";

const BASE_CONFIG: ForwardQuoteCaptureConfig = {
  series: "KXBTC15M",
  durationMinutes: 1,
  maxMarkets: 1,
  outputDir: "data/live-capture/forward-quotes",
  dryRun: true,
  captureBtcSpot: true,
  rolloverCheckSeconds: 30,
  healthFlushSeconds: 60,
  topOfBookThrottleMs: 0,
  wsWatchdogEnabled: true,
  wsSoftSilenceThresholdMs: 30_000,
  wsHardStallThresholdMs: 60_000,
  wsProbeGraceMs: 10_000,
  wsRecoveryMaxAttempts: 5,
};

function createIo(files: Record<string, string> = {}) {
  const written: Record<string, string> = { ...files };
  const appended: Record<string, string[]> = {};

  return {
    io: {
      readFile: (path: string) => written[path] ?? "",
      writeFile: (path: string, data: string) => {
        written[path] = data;
      },
      appendFile: (path: string, data: string) => {
        appended[path] = [...(appended[path] ?? []), data];
        written[path] = (written[path] ?? "") + data;
      },
      mkdirSync: () => {},
      now: () => new Date("2026-07-09T00:00:00.000Z"),
      monotonicNowMs: () => 1000,
    },
    written,
    appended,
  };
}

describe("resolveKalshiCaptureCredentials", () => {
  it("reports missing credentials as blocked", () => {
    const credentials = resolveKalshiCaptureCredentials({ env: {} });
    expect(credentials.status).toBe("missing");
  });
});

describe("runDryRunForwardQuoteCapture", () => {
  it("writes all JSONL files in dry-run", async () => {
    const { io, written } = createIo();
    const discovery = {
      attempted: true,
      succeeded: true,
      seriesTicker: "KXBTC15M",
      discoveredMarketCount: 1,
      selectedMarketTickers: ["KXBTC15M-MOCK"],
      marketStatuses: { "KXBTC15M-MOCK": "mock" },
      eventTickers: { "KXBTC15M-MOCK": null },
      closeTimes: { "KXBTC15M-MOCK": null },
      error: null,
    };

    const result = runDryRunForwardQuoteCapture({
      runId: "run-1",
      startedAt: "2026-07-09T00:00:00.000Z",
      config: BASE_CONFIG,
      discovery,
      io,
    });

    expect(result.recordCounts.raw).toBeGreaterThan(0);
    expect(result.recordCounts.topOfBook).toBeGreaterThan(0);
    expect(result.recordCounts.btcSpot).toBeGreaterThan(0);
    expect(result.recordCounts.marketMetadata).toBeGreaterThan(0);
    expect(written[result.paths.rawKalshiWsPath]).toContain("kalshi-ws");
    expect(written[result.paths.topOfBookPath]).toContain("yesBestBidCents");
  });
});

describe("runForwardQuoteCapture", () => {
  it("produces dry-run-ok verdict and HTML report", async () => {
    const { io, written } = createIo();
    const result = await runForwardQuoteCapture({
      config: BASE_CONFIG,
      io,
      htmlOutputPath: "data/reports/forward-quote-capture.html",
    });

    expect(result.healthReport.verdict).toBe("dry-run-ok");
    expect(written["data/reports/forward-quote-capture.html"]).toContain("dry-run-ok");
    expect(written["data/reports/forward-quote-capture.html"]).toContain(
      "No orders are placed",
    );
  });
});

describe("OrderbookCaptureBook", () => {
  it("detects sequence gap and marks gap-detected", () => {
    const book = new OrderbookCaptureBook({
      marketTicker: "KXBTC15M-TEST",
      seriesTicker: "KXBTC15M",
    });

    const [snapshot, delta2, delta3, gapDelta] = createMockForwardCaptureMessages("KXBTC15M-TEST");
    book.applySnapshot(snapshot);
    book.applyDelta(delta2 as never);
    book.applyDelta(delta3 as never);
    book.applyDelta(gapDelta as never);

    expect(book.bookState).toBe("gap-detected");
  });

  it("derives signed and clamped spreads without hiding crossed state", () => {
    const book = new OrderbookCaptureBook({
      marketTicker: "KXBTC15M-TEST",
      seriesTicker: "KXBTC15M",
    });
    const [snapshot] = createMockForwardCaptureMessages("KXBTC15M-TEST");
    book.applySnapshot(snapshot);
    book.yesBids.set(54, 10);
    book.noBids.set(70, 10);

    const record = book.toTopOfBookRecord({
      runId: "run-1",
      receivedAtLocal: "2026-07-09T00:00:00.000Z",
      exchangeTimestampMs: null,
    });

    expect(record.yesSignedSpreadCents).toBeLessThan(0);
    expect(record.yesSpreadCents).toBe(0);
    expect(record.economicBookState).toBe("sequence-valid-crossed");
    expect(record.isEconomicallyValid).toBe(false);
  });
});

describe("ForwardCaptureMessageProcessor", () => {
  it("records resync attempts on gap", () => {
    const { io } = createIo();
    const paths = createRunOutputPaths(BASE_CONFIG.outputDir, "run-1");
    const writer = createJsonlForwardCaptureWriter(io, paths);
    let gapTicker: string | null = null;

    const processor = new ForwardCaptureMessageProcessor({
      runId: "run-1",
      seriesTicker: "KXBTC15M",
      config: BASE_CONFIG,
      writer,
      now: () => new Date("2026-07-09T00:00:00.000Z"),
      monotonicNowMs: () => 1000,
      onSequenceGap: (ticker) => {
        gapTicker = ticker;
        processor.markResyncing(ticker);
      },
    });

    const messages = createMockForwardCaptureMessages("KXBTC15M-TEST");
    for (const message of messages) {
      processor.processRawPayload(message);
    }

    expect(gapTicker).toBe("KXBTC15M-TEST");
    expect(processor.diagnostics.sequenceGapCount).toBeGreaterThan(0);
    expect(processor.diagnostics.resyncAttemptCount).toBeGreaterThan(0);
  });

  it("bypasses throttle on invalid to economically-valid transition", () => {
    const { io, appended } = createIo();
    const paths = createRunOutputPaths(BASE_CONFIG.outputDir, "run-throttle");
    const writer = createJsonlForwardCaptureWriter(io, paths);
    let monotonicMs = 0;

    const processor = new ForwardCaptureMessageProcessor({
      runId: "run-throttle",
      seriesTicker: "KXBTC15M",
      config: { ...BASE_CONFIG, topOfBookThrottleMs: 1000 },
      writer,
      now: () => new Date("2026-07-09T00:00:00.000Z"),
      monotonicNowMs: () => {
        monotonicMs += 100;
        return monotonicMs;
      },
    });

    const marketTicker = "KXBTC15M-THROTTLE";
    const crossedSnapshot = {
      type: "orderbook_snapshot",
      sid: 1,
      seq: 1,
      msg: {
        market_ticker: marketTicker,
        market_id: "mock",
        yes_dollars_fp: [["0.5400", "10.00"]],
        no_dollars_fp: [["0.7000", "10.00"]],
      },
    };
    const validSnapshot = {
      type: "orderbook_snapshot",
      sid: 1,
      seq: 2,
      msg: {
        market_ticker: marketTicker,
        market_id: "mock",
        yes_dollars_fp: [["0.4500", "10.00"]],
        no_dollars_fp: [["0.5000", "10.00"]],
      },
    };

    processor.processRawPayload(crossedSnapshot);
    processor.processRawPayload(validSnapshot);

    const topOfBookLines = appended[paths.topOfBookPath] ?? [];
    expect(topOfBookLines.length).toBe(2);
    expect(processor.diagnostics.crossedTopOfBookRecords).toBe(1);
    expect(processor.diagnostics.economicallyValidTopOfBookRecords).toBe(1);
  });

  it("bypasses throttle on economically-valid to crossed transition", () => {
    const { io, appended } = createIo();
    const paths = createRunOutputPaths(BASE_CONFIG.outputDir, "run-throttle-invalid");
    const writer = createJsonlForwardCaptureWriter(io, paths);
    let monotonicMs = 0;

    const processor = new ForwardCaptureMessageProcessor({
      runId: "run-throttle-invalid",
      seriesTicker: "KXBTC15M",
      config: { ...BASE_CONFIG, topOfBookThrottleMs: 1000 },
      writer,
      now: () => new Date("2026-07-09T00:00:00.000Z"),
      monotonicNowMs: () => {
        monotonicMs += 100;
        return monotonicMs;
      },
    });

    const marketTicker = "KXBTC15M-THROTTLE-2";
    const validSnapshot = {
      type: "orderbook_snapshot",
      sid: 1,
      seq: 1,
      msg: {
        market_ticker: marketTicker,
        market_id: "mock",
        yes_dollars_fp: [["0.4500", "10.00"]],
        no_dollars_fp: [["0.5000", "10.00"]],
      },
    };
    const crossedSnapshot = {
      type: "orderbook_snapshot",
      sid: 1,
      seq: 2,
      msg: {
        market_ticker: marketTicker,
        market_id: "mock",
        yes_dollars_fp: [["0.5400", "10.00"]],
        no_dollars_fp: [["0.7000", "10.00"]],
      },
    };

    processor.processRawPayload(validSnapshot);
    processor.processRawPayload(crossedSnapshot);

    const topOfBookLines = appended[paths.topOfBookPath] ?? [];
    expect(topOfBookLines.length).toBe(2);
    expect(processor.diagnostics.economicallyValidTopOfBookRecords).toBe(1);
    expect(processor.diagnostics.crossedTopOfBookRecords).toBe(1);
  });
});

describe("evaluateForwardCaptureVerdict", () => {
  const successDiscovery = {
    attempted: true,
    succeeded: true,
    seriesTicker: "KXBTC15M",
    discoveredMarketCount: 2,
    selectedMarketTickers: ["M1", "M2"],
    marketStatuses: {},
    eventTickers: {},
    closeTimes: {},
    error: null,
  };

  it("classifies completed live capture as success when disconnected at final report", () => {
    expect(
      evaluateForwardCaptureVerdict({
        dryRun: false,
        credentialStatus: "available",
        discovery: successDiscovery,
        authHeadersGenerated: true,
        wsConnectCount: 1,
        marketsSubscribed: 2,
        rawMessageCount: 162_797,
        snapshotsReceived: 4,
        topOfBookRecordsEmitted: 162_793,
        economicallyValidTopOfBookRecords: 17,
        sequenceGapCount: 0,
        resyncSuccessCount: 0,
        errors: [],
      }),
    ).toBe("capture-mvp-success");
  });

  it("classifies true auth failure as blocked-ws-auth", () => {
    expect(
      evaluateForwardCaptureVerdict({
        dryRun: false,
        credentialStatus: "available",
        discovery: successDiscovery,
        authHeadersGenerated: true,
        wsConnectCount: 0,
        marketsSubscribed: 0,
        rawMessageCount: 0,
        snapshotsReceived: 0,
        topOfBookRecordsEmitted: 0,
        economicallyValidTopOfBookRecords: 0,
        sequenceGapCount: 0,
        resyncSuccessCount: 0,
        errors: ["WebSocket connection failed"],
      }),
    ).toBe("blocked-ws-auth");
  });

  it("keeps dry-run as dry-run-ok", () => {
    expect(
      evaluateForwardCaptureVerdict({
        dryRun: true,
        credentialStatus: "missing",
        discovery: successDiscovery,
        authHeadersGenerated: false,
        wsConnectCount: 0,
        marketsSubscribed: 1,
        rawMessageCount: 5,
        snapshotsReceived: 1,
        topOfBookRecordsEmitted: 5,
        economicallyValidTopOfBookRecords: 5,
        sequenceGapCount: 0,
        resyncSuccessCount: 0,
        errors: [],
      }),
    ).toBe("dry-run-ok");
  });

  it("classifies sequence gaps without resync as degraded-capture", () => {
    expect(
      evaluateForwardCaptureVerdict({
        dryRun: false,
        credentialStatus: "available",
        discovery: successDiscovery,
        authHeadersGenerated: true,
        wsConnectCount: 1,
        marketsSubscribed: 1,
        rawMessageCount: 100,
        snapshotsReceived: 1,
        topOfBookRecordsEmitted: 100,
        economicallyValidTopOfBookRecords: 100,
        sequenceGapCount: 2,
        resyncSuccessCount: 0,
        errors: [],
      }),
    ).toBe("degraded-capture");
  });
});

describe("buildForwardCaptureHealthReport", () => {
  it("returns valid capture verdict for dry-run", () => {
    const { io } = createIo();
    const dryRun = runDryRunForwardQuoteCapture({
      runId: "run-1",
      startedAt: "2026-07-09T00:00:00.000Z",
      config: BASE_CONFIG,
      discovery: {
        attempted: true,
        succeeded: true,
        seriesTicker: "KXBTC15M",
        discoveredMarketCount: 1,
        selectedMarketTickers: ["KXBTC15M-MOCK"],
        marketStatuses: {},
        eventTickers: {},
        closeTimes: {},
        error: null,
      },
      io,
    });

    const report = buildForwardCaptureHealthReport({
      runId: "run-1",
      generatedAt: "2026-07-09T00:00:00.000Z",
      startedAt: "2026-07-09T00:00:00.000Z",
      endedAt: "2026-07-09T00:01:00.000Z",
      config: BASE_CONFIG,
      credentials: resolveKalshiCaptureCredentials({ env: {} }),
      discovery: dryRun.discovery,
      captureResult: dryRun,
    });

    expect(report.verdict).toBe("dry-run-ok");
    expect(report.capture.topOfBookRecordCount).toBeGreaterThan(0);
    expect(report.orderbook.economicallyValidTopOfBookRecords).toBeGreaterThan(0);
  });

  it("reports everConnected semantics for completed live capture disconnected at shutdown", () => {
    const report = buildForwardCaptureHealthReport({
      runId: "2026-07-09T21-37-58-543Z",
      generatedAt: "2026-07-09T22:00:00.000Z",
      startedAt: "2026-07-09T21:37:58.543Z",
      endedAt: "2026-07-09T21:47:58.543Z",
      config: { ...BASE_CONFIG, dryRun: false },
      credentials: {
        status: "available",
        apiKeyId: "key",
        apiBaseUrl: null,
        wsUrl: null,
        privateKeyMaterial: {
          status: "loaded",
          source: "path",
          privateKeyPem: null,
          privateKeyLoaded: true,
          privateKeyFingerprint: "abc",
          warnings: [],
          error: null,
        },
        privateKeySource: "path",
        privateKeyLoaded: true,
        privateKeyFingerprint: "abc",
        keyIdPresent: true,
        warnings: [],
        error: null,
      },
      discovery: {
        attempted: true,
        succeeded: true,
        seriesTicker: "KXBTC15M",
        discoveredMarketCount: 2,
        selectedMarketTickers: ["M1", "M2"],
        marketStatuses: {},
        eventTickers: {},
        closeTimes: {},
        error: null,
      },
      captureResult: {
        runId: "2026-07-09T21-37-58-543Z",
        startedAt: "2026-07-09T21:37:58.543Z",
        endedAt: "2026-07-09T21:47:58.543Z",
        paths: createRunOutputPaths(BASE_CONFIG.outputDir, "run-live"),
        discovery: {
          attempted: true,
          succeeded: true,
          seriesTicker: "KXBTC15M",
          discoveredMarketCount: 2,
          selectedMarketTickers: ["M1", "M2"],
          marketStatuses: {},
          eventTickers: {},
          closeTimes: {},
          error: null,
        },
        processor: {
          diagnostics: {
            ...createEmptyOrderbookDiagnostics(),
            rawMessageCount: 162_797,
            snapshotsReceived: 4,
            deltasReceived: 162_789,
            topOfBookRecordsEmitted: 162_793,
            validTopOfBookRecords: 17,
            sequenceValidTopOfBookRecords: 162_793,
            economicallyValidTopOfBookRecords: 17,
            parityUsableTopOfBookRecords: 17,
            crossedTopOfBookRecords: 531,
            marketsWithValidBook: 2,
            validBookStateDurationMs: 1,
          },
          finalize: () => {},
        },
        connection: {
          wsConnectCount: 1,
          wsDisconnectCount: 0,
          reconnectCount: 0,
          connected: false,
          everConnected: false,
          completedNormally: false,
          liveConnectionSucceeded: false,
          completedWithWarnings: false,
          terminalFailureReason: null,
          captureEndReason: "duration-complete",
        },
        rollover: {
          marketsDiscovered: 2,
          marketsSubscribed: 2,
          marketsClosed: 0,
          rolloverChecks: 10,
          rolloverSubscriptionsAdded: 0,
        },
        btcSpotStatus: "healthy",
        connected: true,
        wsUrl: "wss://example",
        authHeadersGenerated: true,
        errors: [],
        recordCounts: { raw: 162_797, topOfBook: 162_793, btcSpot: 120, marketMetadata: 2 },
      },
    });

    expect(report.verdict).toBe("capture-mvp-success");
    expect(report.connection.everConnected).toBe(true);
    expect(report.connection.connected).toBe(false);
    expect(report.connection.completedNormally).toBe(true);
    expect(report.connection.liveConnectionSucceeded).toBe(true);
    expect(report.recommendedNextAction).toBe("continue-capture");
  });
});

describe("credential redaction", () => {
  it("redacts PEM from serialized health", () => {
    const redacted = redactCaptureArtifactText(
      '{"privateKey":"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----"}',
    );
    expect(redacted).not.toContain("BEGIN PRIVATE KEY");
  });
});

describe("forwardQuoteCaptureSafetyGuard", () => {
  it("blocks order placement symbols", () => {
    expect(() => assertForwardCaptureSafety("import { placeOrder }")).toThrow();
  });
});

describe("discoverCaptureMarkets", () => {
  it("uses market ticker override", async () => {
    const result = await discoverCaptureMarkets({
      seriesTicker: "KXBTC15M",
      maxMarkets: 1,
      marketTickerOverride: "KXBTC15M-OVERRIDE",
    });

    expect(result.succeeded).toBe(true);
    expect(result.selectedMarketTickers).toEqual(["KXBTC15M-OVERRIDE"]);
  });
});

describe("buildForwardCaptureHealthReport economic metrics", () => {
  it("tracks sequence-valid vs economically-valid separately", () => {
    const diagnostics = createEmptyOrderbookDiagnostics();
    diagnostics.topOfBookRecordsEmitted = 100;
    diagnostics.sequenceValidTopOfBookRecords = 90;
    diagnostics.economicallyValidTopOfBookRecords = 12;
    diagnostics.validTopOfBookRecords = 12;
    diagnostics.parityUsableTopOfBookRecords = 12;
    diagnostics.crossedTopOfBookRecords = 70;

    const report = buildForwardCaptureHealthReport({
      runId: "run-economic",
      generatedAt: "2026-07-09T00:00:00.000Z",
      startedAt: "2026-07-09T00:00:00.000Z",
      endedAt: "2026-07-09T00:10:00.000Z",
      config: { ...BASE_CONFIG, dryRun: false },
      credentials: resolveKalshiCaptureCredentials({ env: {} }),
      discovery: {
        attempted: true,
        succeeded: true,
        seriesTicker: "KXBTC15M",
        discoveredMarketCount: 1,
        selectedMarketTickers: ["M1"],
        marketStatuses: {},
        eventTickers: {},
        closeTimes: {},
        error: null,
      },
      captureResult: {
        runId: "run-economic",
        startedAt: "2026-07-09T00:00:00.000Z",
        endedAt: "2026-07-09T00:10:00.000Z",
        paths: createRunOutputPaths(BASE_CONFIG.outputDir, "run-economic"),
        discovery: {
          attempted: true,
          succeeded: true,
          seriesTicker: "KXBTC15M",
          discoveredMarketCount: 1,
          selectedMarketTickers: ["M1"],
          marketStatuses: {},
          eventTickers: {},
          closeTimes: {},
          error: null,
        },
        processor: {
          diagnostics,
          finalize: () => {},
        },
        connection: {
          wsConnectCount: 1,
          wsDisconnectCount: 0,
          reconnectCount: 0,
          connected: false,
          everConnected: false,
          completedNormally: false,
          liveConnectionSucceeded: false,
          completedWithWarnings: false,
          terminalFailureReason: null,
          captureEndReason: "duration-complete",
        },
        rollover: {
          marketsDiscovered: 1,
          marketsSubscribed: 1,
          marketsClosed: 0,
          rolloverChecks: 0,
          rolloverSubscriptionsAdded: 0,
        },
        btcSpotStatus: "healthy",
        connected: true,
        wsUrl: "wss://example",
        authHeadersGenerated: true,
        errors: [],
        recordCounts: { raw: 100, topOfBook: 100, btcSpot: 0, marketMetadata: 0 },
      },
    });

    expect(report.orderbook.topOfBookRecordsEmitted).toBe(100);
    expect(report.orderbook.sequenceValidTopOfBookRecords).toBe(90);
    expect(report.orderbook.economicallyValidTopOfBookRecords).toBe(12);
    expect(report.orderbook.validTopOfBookRecords).toBe(12);
    expect(report.warnings.some((warning) => warning.includes("crossed share"))).toBe(true);
  });
});

describe("serializeForwardQuoteCaptureHtml", () => {
  it("includes caveats", async () => {
    const { io } = createIo();
    const result = await runForwardQuoteCapture({
      config: BASE_CONFIG,
      io,
    });
    const html = serializeForwardQuoteCaptureHtml(result.healthReport);
    expect(html).toContain("No orders are placed");
  });
});
