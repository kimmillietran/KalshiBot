import { describe, expect, it } from "vitest";

import {
  buildCaptureHealthAuditReport,
  computeCaptureHealthMetrics,
  createCaptureHealthAuditConfig,
  evaluateCaptureReadinessVerdict,
  loadCaptureRunArtifacts,
  serializeCaptureHealthAuditHtml,
  serializeCaptureHealthAuditReport,
} from "./index";
import { CaptureHealthAuditError } from "./captureHealthAuditTypes";

type MemoryIo = {
  io: {
    readFile: (path: string) => string;
    fileExists: (path: string) => boolean;
    isDirectory: (path: string) => boolean;
  };
  files: Record<string, string>;
  dirs: Set<string>;
};

function createMemoryIo(files: Record<string, string> = {}, dirs: string[] = []): MemoryIo {
  const dirSet = new Set(dirs.map((dir) => dir.replaceAll("\\", "/")));

  return {
    files,
    dirs: dirSet,
    io: {
      readFile: (path) => files[path.replaceAll("\\", "/")] ?? "",
      fileExists: (path) => {
        const normalized = path.replaceAll("\\", "/");
        return normalized in files || dirSet.has(normalized);
      },
      isDirectory: (path) => dirSet.has(path.replaceAll("\\", "/")),
    },
  };
}

function topOfBookLine(input: {
  marketTicker?: string;
  eventTicker?: string | null;
  receivedAtLocal: string;
  bookState?: string;
  yesBestBidCents?: number | null;
  yesBestAskCents?: number | null;
  yesSpreadCents?: number | null;
  exchangeTimestampMs?: number | null;
}): string {
  return JSON.stringify({
    runId: "run-1",
    marketTicker: input.marketTicker ?? "KXBTC15M-TEST",
    eventTicker: input.eventTicker ?? "KXBTC15M-EVENT",
    seriesTicker: "KXBTC15M",
    receivedAtLocal: input.receivedAtLocal,
    exchangeTimestampMs: input.exchangeTimestampMs ?? Date.parse(input.receivedAtLocal),
    sequence: 1,
    bookState: input.bookState ?? "valid",
    yesBestBidCents: input.yesBestBidCents ?? 45,
    yesBestAskCents: input.yesBestAskCents ?? 50,
    yesSpreadCents: input.yesSpreadCents ?? 5,
    noSpreadCents: 5,
    rawMessageType: "orderbook_delta",
  });
}

function btcSpotLine(receivedAtLocal: string, priceUsd = 100_000): string {
  return JSON.stringify({
    runId: "run-1",
    source: "coinbase",
    receivedAtLocal,
    exchangeTimestampMs: Date.parse(receivedAtLocal),
    priceUsd,
  });
}

function buildRunDir(prefix: string): string {
  return `data/live-capture/kalshi-ws-spike/${prefix}`;
}

describe("captureHealthAudit", () => {
  it("reports capture-empty for an empty run dir", () => {
    const runDir = buildRunDir("empty-run");
    const { io } = createMemoryIo({}, [runDir]);

    const report = buildCaptureHealthAuditReport({
      generatedAt: "2026-07-09T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      captureRunDir: runDir,
      config: createCaptureHealthAuditConfig(),
      io,
    });

    expect(report.summary.verdict).toBe("capture-empty");
    expect(report.summary.topOfBookCount).toBe(0);
  });

  it("reports capture-invalid when top-of-book is missing", () => {
    const runDir = buildRunDir("missing-top");
    const rawPath = `${runDir}/raw-messages.jsonl`;
    const { io } = createMemoryIo(
      {
        [rawPath]: `${JSON.stringify({ marketTicker: "KXBTC15M-TEST" })}\n`,
      },
      [runDir],
    );

    const report = buildCaptureHealthAuditReport({
      generatedAt: "2026-07-09T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      captureRunDir: runDir,
      config: createCaptureHealthAuditConfig(),
      io,
    });

    expect(report.summary.verdict).toBe("capture-invalid");
    expect(report.summary.rawMessageCount).toBe(1);
  });

  it("reports capture-too-short for a valid short smoke run", () => {
    const runDir = buildRunDir("short-smoke");
    const topPath = `${runDir}/top-of-book.jsonl`;
    const healthPath = `${runDir}/capture-health.json`;
    const { io } = createMemoryIo(
      {
        [topPath]: [
          topOfBookLine({ receivedAtLocal: "2026-07-09T00:00:00.000Z" }),
          topOfBookLine({ receivedAtLocal: "2026-07-09T00:00:05.000Z" }),
        ].join("\n"),
        [healthPath]: JSON.stringify({
          config: { durationSeconds: 5, dryRun: true },
          orderbook: { sequenceGapCount: 1, outOfOrderCount: 0, reconnectCount: 0 },
        }),
      },
      [runDir],
    );

    const report = buildCaptureHealthAuditReport({
      generatedAt: "2026-07-09T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      captureRunDir: runDir,
      config: createCaptureHealthAuditConfig(),
      io,
    });

    expect(report.summary.verdict).toBe("capture-too-short");
    expect(report.summary.runDurationSeconds).toBe(5);
    expect(report.summary.topOfBookCount).toBe(2);
  });

  it("reports capture-gappy when p90 gap exceeds threshold", () => {
    const runDir = buildRunDir("gappy-run");
    const topPath = `${runDir}/top-of-book.jsonl`;
    const healthPath = `${runDir}/capture-health.json`;
    const lines = [
      topOfBookLine({ receivedAtLocal: "2026-07-09T00:00:00.000Z", bookState: "valid" }),
      topOfBookLine({ receivedAtLocal: "2026-07-09T00:10:00.000Z", bookState: "valid" }),
      topOfBookLine({ receivedAtLocal: "2026-07-09T01:10:00.000Z", bookState: "valid" }),
    ];

    const { io } = createMemoryIo(
      {
        [topPath]: lines.join("\n"),
        [healthPath]: JSON.stringify({
          config: { durationSeconds: 4200 },
          orderbook: { sequenceGapCount: 2, outOfOrderCount: 0, reconnectCount: 1 },
        }),
      },
      [runDir],
    );

    const report = buildCaptureHealthAuditReport({
      generatedAt: "2026-07-09T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      captureRunDir: runDir,
      config: createCaptureHealthAuditConfig(),
      io,
    });

    expect(report.summary.verdict).toBe("capture-gappy");
    expect(report.summary.continuity.p90TopOfBookGapMs).toBeGreaterThan(30_000);
    expect(report.summary.bookState.reconnectCount).toBe(1);
  });

  it("reports capture-no-btc-spot when BTC join coverage is insufficient", () => {
    const runDir = buildRunDir("no-btc");
    const topPath = `${runDir}/top-of-book.jsonl`;
    const healthPath = `${runDir}/capture-health.json`;
    const lines = Array.from({ length: 121 }, (_, index) =>
      topOfBookLine({
        receivedAtLocal: new Date(Date.parse("2026-07-09T00:00:00.000Z") + index * 5_000).toISOString(),
      }),
    );

    const { io } = createMemoryIo(
      {
        [topPath]: lines.join("\n"),
        [healthPath]: JSON.stringify({
          config: { durationSeconds: 900, captureBtcSpot: true },
          btcSpot: { status: "enabled" },
        }),
      },
      [runDir],
    );

    const report = buildCaptureHealthAuditReport({
      generatedAt: "2026-07-09T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      captureRunDir: runDir,
      config: createCaptureHealthAuditConfig(),
      io,
    });

    expect(report.summary.verdict).toBe("capture-no-btc-spot");
  });

  it("reports capture-zero-spread-suspicious when spreads are all zero", () => {
    const runDir = buildRunDir("zero-spread");
    const topPath = `${runDir}/top-of-book.jsonl`;
    const healthPath = `${runDir}/capture-health.json`;
    const lines = Array.from({ length: 121 }, (_, index) =>
      topOfBookLine({
        receivedAtLocal: new Date(Date.parse("2026-07-09T00:00:00.000Z") + index * 5_000).toISOString(),
        yesBestBidCents: 50,
        yesBestAskCents: 50,
        yesSpreadCents: 0,
      }),
    );

    const { io } = createMemoryIo(
      {
        [topPath]: lines.join("\n"),
        [healthPath]: JSON.stringify({ config: { durationSeconds: 1200 } }),
      },
      [runDir],
    );

    const report = buildCaptureHealthAuditReport({
      generatedAt: "2026-07-09T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      captureRunDir: runDir,
      config: createCaptureHealthAuditConfig(),
      io,
    });

    expect(report.summary.verdict).toBe("capture-zero-spread-suspicious");
    expect(report.summary.spread.zeroSpreadShare).toBe(1);
  });

  it("reports capture-research-ready for synthetic long capture", () => {
    const runDir = buildRunDir("research-ready");
    const topPath = `${runDir}/top-of-book.jsonl`;
    const btcPath = `${runDir}/btc-spot.jsonl`;
    const healthPath = `${runDir}/capture-health.json`;

    const topLines = Array.from({ length: 30 }, (_, index) =>
      topOfBookLine({
        marketTicker: index % 2 === 0 ? "KXBTC15M-A" : "KXBTC15M-B",
        eventTicker: index % 2 === 0 ? "EVENT-A" : "EVENT-B",
        receivedAtLocal: new Date(Date.parse("2026-07-09T00:00:00.000Z") + index * 30_000).toISOString(),
        yesSpreadCents: 3,
      }),
    );
    const btcLines = topLines.map((line) => {
      const parsed = JSON.parse(line) as { receivedAtLocal: string };
      return btcSpotLine(parsed.receivedAtLocal);
    });

    const { io } = createMemoryIo(
      {
        [topPath]: topLines.join("\n"),
        [btcPath]: btcLines.join("\n"),
        [healthPath]: JSON.stringify({
          config: { durationSeconds: 900, captureBtcSpot: true },
          btcSpot: { status: "enabled" },
          orderbook: { sequenceGapCount: 0, outOfOrderCount: 0, reconnectCount: 0 },
        }),
      },
      [runDir],
    );

    const report = buildCaptureHealthAuditReport({
      generatedAt: "2026-07-09T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      captureRunDir: runDir,
      config: createCaptureHealthAuditConfig(),
      io,
    });

    expect(report.summary.verdict).toBe("capture-research-ready");
    expect(report.summary.marketsCovered).toBe(2);
    expect(report.summary.eventTickersCovered).toBe(2);
    expect(report.summary.btcJoin.joinCoverageShare).toBe(1);
    expect(Object.keys(report.segments.marketTicker)).toHaveLength(2);
  });

  it("computes timestamp gap metrics and BTC join metrics", () => {
    const records = [
      JSON.parse(topOfBookLine({ receivedAtLocal: "2026-07-09T00:00:00.000Z" })),
      JSON.parse(topOfBookLine({ receivedAtLocal: "2026-07-09T00:00:10.000Z" })),
      JSON.parse(topOfBookLine({ receivedAtLocal: "2026-07-09T00:00:25.000Z" })),
    ].map((record, index) => ({
      lineNumber: index + 1,
      runId: record.runId,
      marketTicker: record.marketTicker,
      eventTicker: record.eventTicker,
      seriesTicker: record.seriesTicker,
      receivedAtLocal: record.receivedAtLocal,
      receivedAtMs: Date.parse(record.receivedAtLocal),
      exchangeTimestampMs: record.exchangeTimestampMs,
      sequence: record.sequence,
      bookState: record.bookState,
      yesBestBidCents: record.yesBestBidCents,
      yesBestAskCents: record.yesBestAskCents,
      yesSpreadCents: record.yesSpreadCents,
      noSpreadCents: record.noSpreadCents,
      hourBucket: "2026-07-09T00",
    }));

    const btcRecords = records.map((record) => ({
      receivedAtLocal: record.receivedAtLocal,
      receivedAtMs: record.receivedAtMs,
      exchangeTimestampMs: record.exchangeTimestampMs,
      priceUsd: 100_000,
    }));

    const metrics = computeCaptureHealthMetrics({
      config: createCaptureHealthAuditConfig(),
      topOfBookRecords: records,
      btcSpotRecords: btcRecords,
      captureHealth: { config: { durationSeconds: 25, captureBtcSpot: true } },
    });

    expect(metrics.continuity.medianTopOfBookGapMs).toBe(12_500);
    expect(metrics.continuity.p90TopOfBookGapMs).toBe(15_000);
    expect(metrics.btcJoin.joinCoverageShare).toBe(1);
    expect(metrics.btcJoin.medianKalshiToBtcDistanceMs).toBe(0);
  });

  it("serializes stable JSON and HTML containing verdict", () => {
    const runDir = buildRunDir("html-run");
    const topPath = `${runDir}/top-of-book.jsonl`;
    const { io } = createMemoryIo(
      {
        [topPath]: topOfBookLine({ receivedAtLocal: "2026-07-09T00:00:00.000Z" }),
      },
      [runDir],
    );

    const report = buildCaptureHealthAuditReport({
      generatedAt: "2026-07-09T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      captureRunDir: runDir,
      config: createCaptureHealthAuditConfig(),
      io,
    });

    const json = serializeCaptureHealthAuditReport(report);
    const html = serializeCaptureHealthAuditHtml(report);

    expect(json).toContain('"verdict":"capture-too-short"');
    expect(serializeCaptureHealthAuditReport(report)).toBe(json);
    expect(html).toContain("capture-too-short");
    expect(html).toContain("Executive Verdict");
  });

  it("throws for missing capture dir", () => {
    const { io } = createMemoryIo();

    expect(() =>
      loadCaptureRunArtifacts({
        captureRunDir: "data/live-capture/missing",
        io,
      }),
    ).toThrow(CaptureHealthAuditError);
  });

  it("evaluates per-market breakdown segments", () => {
    const runDir = buildRunDir("segments");
    const topPath = `${runDir}/top-of-book.jsonl`;
    const lines = [
      topOfBookLine({ marketTicker: "MKT-A", receivedAtLocal: "2026-07-09T00:00:00.000Z" }),
      topOfBookLine({ marketTicker: "MKT-A", receivedAtLocal: "2026-07-09T00:01:00.000Z", bookState: "gap-detected" }),
      topOfBookLine({ marketTicker: "MKT-B", receivedAtLocal: "2026-07-09T00:02:00.000Z" }),
    ];

    const loaded = loadCaptureRunArtifacts({
      captureRunDir: runDir,
      io: createMemoryIo({ [topPath]: lines.join("\n") }, [runDir]).io,
    });

    const metrics = computeCaptureHealthMetrics({
      config: createCaptureHealthAuditConfig(),
      topOfBookRecords: loaded.topOfBookRecords,
      btcSpotRecords: [],
      captureHealth: null,
    });

    expect(metrics.segments.marketTicker["MKT-A"]?.recordCount).toBe(2);
    expect(metrics.segments.bookState["gap-detected"]?.recordCount).toBe(1);
    expect(
      evaluateCaptureReadinessVerdict({
        config: createCaptureHealthAuditConfig(),
        loaded,
        metrics,
      }).verdict,
    ).toBe("capture-too-short");
  });
});
