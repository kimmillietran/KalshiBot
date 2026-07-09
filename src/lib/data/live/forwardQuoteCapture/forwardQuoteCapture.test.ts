import { describe, expect, it } from "vitest";

import { buildForwardCaptureHealthReport } from "./buildForwardCaptureHealthReport";
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

  it("marks closed markets", () => {
    const book = new OrderbookCaptureBook({
      marketTicker: "KXBTC15M-TEST",
      seriesTicker: "KXBTC15M",
    });
    book.markClosed();
    expect(book.bookState).toBe("closed");
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
