import { describe, expect, it } from "vitest";

import { createMemoryJsonlIo } from "@/lib/data/research/jsonl";
import type { JsonlStreamSummary } from "@/lib/data/research/jsonl";

import { buildCaptureHealthAuditReport } from "./buildCaptureHealthAuditReport";
import { createCaptureHealthAuditConfig } from "./captureHealthAuditConfig";
import { createCaptureHealthAccumulator } from "./captureHealthStreamingAccumulator";
import type { CaptureHealthAuditIo, ParsedTopOfBookRecord } from "./captureHealthAuditTypes";
import { computeCaptureHealthMetrics } from "./computeCaptureHealthMetrics";
import { parseTopOfBookLine } from "./parseCaptureHealthRecords";
import { streamCaptureTopOfBook } from "./streamCaptureTopOfBook";

const HIGH_VOLUME = 150_000;
const RUN_DIR = "data/live-capture/kalshi-ws-spike/high-volume-synthetic";
const TOP_PATH = `${RUN_DIR}/top-of-book.jsonl`;
const HEALTH_PATH = `${RUN_DIR}/capture-health.json`;
const BTC_PATH = `${RUN_DIR}/btc-spot.jsonl`;

function syntheticTopOfBookLine(index: number): string {
  const receivedAtMs = Date.parse("2026-07-09T00:00:00.000Z") + index * 50;
  return JSON.stringify({
    runId: "high-volume",
    marketTicker: `MKT-${index % 4}`,
    eventTicker: `EVENT-${index % 2}`,
    seriesTicker: "KXBTC15M",
    receivedAtLocal: new Date(receivedAtMs).toISOString(),
    exchangeTimestampMs: receivedAtMs,
    sequence: index,
    bookState: index % 17 === 0 ? "gap-detected" : "valid",
    yesBestBidCents: 40,
    yesBestAskCents: 45,
    yesSpreadCents: 5,
    noSpreadCents: 5,
  });
}

function syntheticBtcLine(index: number): string {
  const receivedAtMs = Date.parse("2026-07-09T00:00:00.000Z") + index * 5_000;
  return JSON.stringify({
    receivedAtLocal: new Date(receivedAtMs).toISOString(),
    exchangeTimestampMs: receivedAtMs,
    priceUsd: 100_000,
  });
}

function emptySummary(): JsonlStreamSummary {
  return {
    linesRead: 0,
    blankLinesSkipped: 0,
    invalidLineCount: 0,
    recordsHandled: 0,
    truncated: false,
  };
}

/**
 * Streaming fake IO: generates TOB/BTC lines on demand without materializing
 * a large JSONL string or ParsedTopOfBookRecord[].
 */
function createGeneratedCaptureIo(): CaptureHealthAuditIo {
  const health = JSON.stringify({
    config: { durationSeconds: 7_200, captureBtcSpot: true },
    btcSpot: { status: "enabled" },
    orderbook: { sequenceGapCount: 0, outOfOrderCount: 0, reconnectCount: 0 },
  });
  const btcCount = 1_200;

  const iterateJsonl: CaptureHealthAuditIo["iterateJsonl"] = async (path, options) => {
    const normalized = path.replaceAll("\\", "/");
    const summary = emptySummary();
    const emit = async (line: string) => {
      summary.linesRead += 1;
      const action = await options.onLine(line, summary.linesRead);
      if (action === "skip") {
        summary.invalidLineCount += 1;
        return;
      }
      summary.recordsHandled += 1;
    };

    if (normalized === TOP_PATH) {
      for (let index = 0; index < HIGH_VOLUME; index += 1) {
        await emit(syntheticTopOfBookLine(index));
      }
      return summary;
    }
    if (normalized === BTC_PATH) {
      for (let index = 0; index < btcCount; index += 1) {
        await emit(syntheticBtcLine(index));
      }
      return summary;
    }
    return summary;
  };

  return {
    readFile: (path) => {
      if (path.replaceAll("\\", "/") === HEALTH_PATH) {
        return health;
      }
      return "";
    },
    fileExists: (path) => {
      const normalized = path.replaceAll("\\", "/");
      return (
        normalized === RUN_DIR
        || normalized === TOP_PATH
        || normalized === HEALTH_PATH
        || normalized === BTC_PATH
      );
    },
    fileSizeBytes: (path) => {
      const normalized = path.replaceAll("\\", "/");
      if (normalized === HEALTH_PATH) {
        return Buffer.byteLength(health, "utf8");
      }
      return null;
    },
    fileMtimeMs: () => 1,
    isDirectory: (path) => path.replaceAll("\\", "/") === RUN_DIR,
    iterateJsonl,
    streamJsonl: iterateJsonl,
  };
}

describe("bounded-memory capture-health streaming", () => {
  it("completes a high-volume synthetic stream without retaining parsed TOB rows", async () => {
    const io = createGeneratedCaptureIo();
    const retained: ParsedTopOfBookRecord[] = [];
    const config = createCaptureHealthAuditConfig();

    const report = await buildCaptureHealthAuditReport({
      generatedAt: "2026-07-09T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      captureRunDir: RUN_DIR,
      config,
      io,
    });

    expect(report.summary.topOfBookCount).toBe(HIGH_VOLUME);
    expect(report.recordsScanned).toBe(HIGH_VOLUME);
    expect(report.summary.marketsCovered).toBe(4);
    expect(report.summary.eventTickersCovered).toBe(2);
    expect(Object.keys(report.segments.marketTicker)).toHaveLength(4);
    expect(Object.keys(report.segments.eventTicker)).toHaveLength(2);
    expect(report.summary.bookState.validBookShare).toBeGreaterThan(0.9);
    expect(report.inputArtifactIdentities.find((entry) => entry.role === "top-of-book")?.recordCount)
      .toBe(HIGH_VOLUME);
    expect(retained).toHaveLength(0);
  });

  it("keeps segment accumulators bounded by segment keys, not parsed row objects", () => {
    const config = createCaptureHealthAuditConfig();
    const accumulator = createCaptureHealthAccumulator({
      config,
      btcSpotRecords: [],
      captureHealth: { config: { durationSeconds: 7_200 } },
    });

    for (let index = 0; index < HIGH_VOLUME; index += 1) {
      const record = parseTopOfBookLine(syntheticTopOfBookLine(index), index + 1);
      if (record) {
        accumulator.add(record);
      }
    }

    const diagnostics = accumulator.diagnostics();
    expect(diagnostics.retainedParsedRecordCount).toBe(0);
    expect(diagnostics.globalTimestampCount).toBe(HIGH_VOLUME);
    expect(diagnostics.segmentKeyCounts.marketTicker).toBe(4);
    expect(diagnostics.segmentKeyCounts.eventTicker).toBe(2);
    expect(diagnostics.segmentTimestampCounts.marketTicker).toBe(HIGH_VOLUME);
    expect(diagnostics.segmentTimestampCounts.eventTicker).toBe(HIGH_VOLUME);
    expect(diagnostics.segmentTimestampCounts.hour).toBe(HIGH_VOLUME);
    expect(diagnostics.segmentTimestampCounts.bookState).toBe(HIGH_VOLUME);

    const streaming = accumulator.finalize();
    expect(streaming.marketsCovered).toBe(4);
    expect(streaming.continuity.medianTopOfBookGapMs).toBe(50);
    expect(streaming.bookState.validBookShare).not.toBeNull();
  });

  it("does not expose a topOfBookRecords array on the loaded artifact", async () => {
    const io = createGeneratedCaptureIo();
    const { loadCaptureRunArtifacts } = await import("./loadCaptureRunArtifacts");
    const loaded = await loadCaptureRunArtifacts({
      captureRunDir: RUN_DIR,
      io,
      retainTopOfBookRecords: false,
    });
    expect(loaded.topOfBookCount).toBe(HIGH_VOLUME);
    expect(loaded.topOfBookRecords).toEqual([]);
  });

  it("reference and streaming stay equal on a compact sample of the generated contract", () => {
    const sample = 64;
    const records = Array.from({ length: sample }, (_, index) =>
      parseTopOfBookLine(syntheticTopOfBookLine(index), index + 1),
    ).filter((record): record is ParsedTopOfBookRecord => record !== null);
    const config = createCaptureHealthAuditConfig();
    const reference = computeCaptureHealthMetrics({
      config,
      topOfBookRecords: records,
      btcSpotRecords: [],
      captureHealth: { config: { durationSeconds: 7_200 } },
    });
    const accumulator = createCaptureHealthAccumulator({
      config,
      btcSpotRecords: [],
      captureHealth: { config: { durationSeconds: 7_200 } },
    });
    for (const record of records) {
      accumulator.add(record);
    }
    expect(accumulator.finalize()).toEqual(reference);
  });
});

function createStreamTestIo(
  files: Record<string, string>,
  dirs: string[],
): CaptureHealthAuditIo {
  const dirSet = new Set(dirs.map((dir) => dir.replaceAll("\\", "/")));
  const jsonl = createMemoryJsonlIo(files);
  return {
    ...jsonl,
    fileExists: (path) => {
      const normalized = path.replaceAll("\\", "/");
      return jsonl.fileExists(path) || dirSet.has(normalized);
    },
    isDirectory: (path) => dirSet.has(path.replaceAll("\\", "/")),
  };
}

describe("streamCaptureTopOfBook consumer fail-closed", () => {
  const runDir = "data/live-capture/kalshi-ws-spike/consumer-fail";
  const topPath = `${runDir}/top-of-book.jsonl`;

  it("propagates synchronous onRecord failures instead of counting them as invalid lines", async () => {
    const io = createStreamTestIo(
      {
        [topPath]: `${syntheticTopOfBookLine(0)}\n${syntheticTopOfBookLine(1)}\n`,
      },
      [runDir],
    );
    let callbackCount = 0;

    await expect(
      streamCaptureTopOfBook({
        path: topPath,
        io,
        onRecord: () => {
          callbackCount += 1;
          throw new Error("consumer failure");
        },
      }),
    ).rejects.toThrow("consumer failure");

    expect(callbackCount).toBe(1);
  });

  it("propagates async onRecord rejections instead of counting them as invalid lines", async () => {
    const io = createStreamTestIo(
      {
        [topPath]: `${syntheticTopOfBookLine(0)}\n${syntheticTopOfBookLine(1)}\n`,
      },
      [runDir],
    );
    let callbackCount = 0;

    await expect(
      streamCaptureTopOfBook({
        path: topPath,
        io,
        onRecord: async () => {
          callbackCount += 1;
          throw new Error("consumer async failure");
        },
      }),
    ).rejects.toThrow("consumer async failure");

    expect(callbackCount).toBe(1);
  });

  it("counts malformed lines as invalid and still delivers later valid rows", async () => {
    const io = createStreamTestIo(
      {
        [topPath]: `{bad\n${syntheticTopOfBookLine(0)}\n`,
      },
      [runDir],
    );
    const received: string[] = [];

    const streamed = await streamCaptureTopOfBook({
      path: topPath,
      io,
      onRecord: (record) => {
        received.push(record.marketTicker);
      },
    });

    expect(streamed.invalidLineCount).toBe(1);
    expect(streamed.topOfBookCount).toBe(1);
    expect(received).toEqual(["MKT-0"]);
  });
});
