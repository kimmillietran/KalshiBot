import { describe, expect, it } from "vitest";

import { collectJsonlRecords, createMemoryJsonlIo } from "@/lib/data/research/jsonl";

import {
  computeSortedGaps,
  findNearestBtcDistanceMs,
  findNearestBtcDistanceMsIndexed,
  indexBtcTimestampsForNearestLookup,
  median,
  percentile,
} from "./captureHealthAuditUtils";
import { createCaptureHealthAuditConfig } from "./captureHealthAuditConfig";
import { computeCaptureHealthMetrics } from "./computeCaptureHealthMetrics";
import { createCaptureHealthAccumulator } from "./captureHealthStreamingAccumulator";
import {
  continuityFromTimestamps,
  medianFromUnsorted,
  percentileSorted,
} from "./growableFloat64Array";
import { parseBtcSpotLine, parseTopOfBookLine } from "./parseCaptureHealthRecords";
import { streamCaptureTopOfBook } from "./streamCaptureTopOfBook";
import type { CaptureHealthAuditIo, ParsedTopOfBookRecord } from "./captureHealthAuditTypes";

function createIo(files: Record<string, string>, dirs: string[]): CaptureHealthAuditIo {
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

function topOfBookLine(input: {
  marketTicker?: string;
  eventTicker?: string | null;
  receivedAtLocal: string;
  bookState?: string;
  yesBestBidCents?: number | null;
  yesBestAskCents?: number | null;
  yesSpreadCents?: number | null;
  noSpreadCents?: number | null;
  exchangeTimestampMs?: number | null;
}): string {
  return JSON.stringify({
    runId: "run-eq",
    marketTicker: input.marketTicker ?? "MKT-A",
    eventTicker: input.eventTicker === undefined ? "EVENT-A" : input.eventTicker,
    seriesTicker: "KXBTC15M",
    receivedAtLocal: input.receivedAtLocal,
    exchangeTimestampMs: input.exchangeTimestampMs ?? Date.parse(input.receivedAtLocal),
    sequence: 1,
    bookState: input.bookState ?? "valid",
    yesBestBidCents: input.yesBestBidCents ?? 45,
    yesBestAskCents: input.yesBestAskCents ?? 50,
    yesSpreadCents: input.yesSpreadCents ?? 5,
    noSpreadCents: input.noSpreadCents ?? 5,
  });
}

function btcSpotLine(receivedAtLocal: string, priceUsd = 100_000): string {
  return JSON.stringify({
    receivedAtLocal,
    exchangeTimestampMs: Date.parse(receivedAtLocal),
    priceUsd,
  });
}

function computeStreamingMetrics(
  records: readonly ParsedTopOfBookRecord[],
  btcLines: readonly string[] = [],
  captureHealth: Parameters<typeof computeCaptureHealthMetrics>[0]["captureHealth"] = null,
) {
  const btcRecords = btcLines
    .map((line) => parseBtcSpotLine(line))
    .filter((record): record is NonNullable<typeof record> => record !== null);
  const config = createCaptureHealthAuditConfig();
  const reference = computeCaptureHealthMetrics({
    config,
    topOfBookRecords: records,
    btcSpotRecords: btcRecords,
    captureHealth,
  });
  const accumulator = createCaptureHealthAccumulator({
    config,
    btcSpotRecords: btcRecords,
    captureHealth,
  });
  for (const record of records) {
    accumulator.add(record);
  }
  return { reference, streaming: accumulator.finalize(), diagnostics: accumulator.diagnostics() };
}

function recordsFromLines(lines: readonly string[]): ParsedTopOfBookRecord[] {
  return lines.flatMap((line, index) => {
    try {
      const parsed = parseTopOfBookLine(line, index + 1);
      return parsed ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

describe("exact percentile equivalence", () => {
  const sizes = [0, 1, 2, 3, 10, 101, 1000];

  it.each(sizes)("matches old median/percentile/gap helpers for n=%s", (size) => {
    const values = Array.from({ length: size }, (_, index) => (index * 37 + 11) % 997);
    const gaps = computeSortedGaps(values);
    const typed = Float64Array.from(values);
    const typedGaps = continuityFromTimestamps(typed);

    expect(median(gaps)).toBe(typedGaps.medianTopOfBookGapMs);
    expect(percentile([...gaps].sort((left, right) => left - right), 90)).toBe(
      typedGaps.p90TopOfBookGapMs,
    );
    expect(
      [...gaps].sort((left, right) => left - right).at(-1) ?? null,
    ).toBe(typedGaps.maxTopOfBookGapMs);
    expect(median(values)).toBe(medianFromUnsorted(typed));
    expect(percentile([...values].sort((left, right) => left - right), 90)).toBe(
      percentileSorted(Float64Array.from([...values].sort((left, right) => left - right)), 90),
    );
  });
});

describe("old-vs-new golden capture-health metrics", () => {
  it("matches empty and single-record fixtures", () => {
    expect(computeStreamingMetrics([]).streaming).toEqual(computeStreamingMetrics([]).reference);

    const single = recordsFromLines([
      topOfBookLine({ receivedAtLocal: "2026-07-09T00:00:00.000Z" }),
    ]);
    const result = computeStreamingMetrics(single);
    expect(result.streaming).toEqual(result.reference);
    expect(result.diagnostics.retainedParsedRecordCount).toBe(0);
  });

  it("matches monotonic, duplicate, slightly out-of-order, and strongly non-monotonic timestamps", () => {
    const base = Date.parse("2026-07-09T00:00:00.000Z");
    const cases: Record<string, number[]> = {
      monotonic: [0, 1_000, 2_000, 3_000, 4_000],
      duplicates: [0, 1_000, 1_000, 2_000, 2_000],
      slightlyOutOfOrder: [0, 2_000, 1_000, 4_000, 3_000],
      stronglyNonMonotonic: [8_000, 0, 5_000, 1_000, 9_000, 2_000],
    };

    for (const timestamps of Object.values(cases)) {
      const lines = timestamps.map((offset, index) =>
        topOfBookLine({
          marketTicker: index % 2 === 0 ? "MKT-A" : "MKT-B",
          eventTicker: index % 2 === 0 ? "EVENT-A" : "EVENT-B",
          receivedAtLocal: new Date(base + offset).toISOString(),
          bookState: index === 1 ? "gap-detected" : "valid",
        }),
      );
      const result = computeStreamingMetrics(recordsFromLines(lines));
      expect(result.streaming).toEqual(result.reference);
    }
  });

  it("matches interleaved segment median gaps rather than global adjacent gaps", () => {
    const lines = [
      topOfBookLine({ marketTicker: "MKT-A", receivedAtLocal: "2026-07-09T00:00:00.000Z" }),
      topOfBookLine({ marketTicker: "MKT-B", receivedAtLocal: "2026-07-09T00:00:01.000Z" }),
      topOfBookLine({ marketTicker: "MKT-A", receivedAtLocal: "2026-07-09T00:00:10.000Z" }),
      topOfBookLine({ marketTicker: "MKT-B", receivedAtLocal: "2026-07-09T00:00:03.000Z" }),
    ];
    const result = computeStreamingMetrics(recordsFromLines(lines));
    expect(result.streaming).toEqual(result.reference);
    expect(result.streaming.segments.marketTicker["MKT-A"]?.medianGapMs).toBe(10_000);
    expect(result.streaming.segments.marketTicker["MKT-B"]?.medianGapMs).toBe(2_000);
    expect(result.streaming.continuity.medianTopOfBookGapMs).not.toBe(10_000);
  });

  it("matches BTC join distances and coverage, including midpoint ties", () => {
    const topLines = [
      topOfBookLine({
        receivedAtLocal: "2026-07-09T00:00:02.500Z",
        exchangeTimestampMs: Date.parse("2026-07-09T00:00:02.500Z"),
      }),
      topOfBookLine({
        receivedAtLocal: "2026-07-09T00:00:10.000Z",
        exchangeTimestampMs: Date.parse("2026-07-09T00:00:10.000Z"),
      }),
    ];
    const btcLines = [
      btcSpotLine("2026-07-09T00:00:00.000Z"),
      btcSpotLine("2026-07-09T00:00:05.000Z"),
      btcSpotLine("2026-07-09T00:00:10.000Z"),
    ];
    const result = computeStreamingMetrics(recordsFromLines(topLines), btcLines, {
      config: { durationSeconds: 900, captureBtcSpot: true },
    });
    expect(result.streaming).toEqual(result.reference);
    expect(result.streaming.btcJoin.joinCoverageShare).toBe(1);
  });

  it("matches seeded randomized fixtures exactly", () => {
    const random = mulberry32(12_626);
    const bookStates = ["valid", "valid", "valid", "gap-detected", "locked", "unknown"];
    const markets = ["MKT-A", "MKT-B", "MKT-C"];
    const events = ["EVENT-A", "EVENT-B", null];
    const base = Date.parse("2026-07-09T00:00:00.000Z");

    for (const size of [2, 7, 25, 64]) {
      const lines: string[] = [];
      for (let generated = 0; generated < size; generated += 1) {
        const offset = Math.floor(random() * 3_600_000) - 60_000;
        const bid = Math.floor(random() * 80);
        const ask = random() < 0.15 ? bid : bid + Math.floor(random() * 8);
        lines.push(topOfBookLine({
          marketTicker: markets[Math.floor(random() * markets.length)],
          eventTicker: events[Math.floor(random() * events.length)],
          receivedAtLocal: new Date(base + offset).toISOString(),
          bookState: bookStates[Math.floor(random() * bookStates.length)],
          yesBestBidCents: bid,
          yesBestAskCents: ask,
          yesSpreadCents: ask - bid,
          noSpreadCents: random() < 0.1 ? 0 : 4,
        }));
      }
      const btcLines = Array.from({ length: Math.max(1, Math.floor(size / 3)) }, (_row, index) =>
        btcSpotLine(new Date(base + index * 5_000).toISOString()),
      );
      const result = computeStreamingMetrics(recordsFromLines(lines), btcLines, {
        config: { durationSeconds: 1_200, captureBtcSpot: true },
        orderbook: { sequenceGapCount: 3, outOfOrderCount: 1, reconnectCount: 2 },
      });
      expect(result.streaming).toEqual(result.reference);
    }
  });

  it("matches malformed-line invalid counts between collect and stream", async () => {
    const runDir = "data/live-capture/kalshi-ws-spike/malformed";
    const topPath = `${runDir}/top-of-book.jsonl`;
    const content = [
      topOfBookLine({ receivedAtLocal: "2026-07-09T00:00:00.000Z" }),
      "{bad",
      JSON.stringify({ marketTicker: "MKT-A" }),
      JSON.stringify({ receivedAtLocal: "2026-07-09T00:00:01.000Z" }),
      JSON.stringify({
        marketTicker: "MKT-A",
        receivedAtLocal: "not-a-date",
      }),
      "",
      topOfBookLine({ receivedAtLocal: "2026-07-09T00:00:02.000Z" }),
    ].join("\n");
    const io = createIo({ [topPath]: content }, [runDir]);

    const collected = await collectJsonlRecords({
      path: topPath,
      io,
      parseLine: parseTopOfBookLine,
    });
    const streamedRecords: ParsedTopOfBookRecord[] = [];
    const streamed = await streamCaptureTopOfBook({
      path: topPath,
      io,
      onRecord: (record) => {
        streamedRecords.push(record);
      },
    });

    expect(streamed.topOfBookCount).toBe(collected.records.length);
    expect(streamed.invalidLineCount).toBe(collected.summary.invalidLineCount);
    expect(streamedRecords.map((record) => record.receivedAtLocal)).toEqual(
      collected.records.map((record) => record.receivedAtLocal),
    );
  });
});

describe("BTC nearest-neighbor equivalence", () => {
  it("binary search matches the original linear scan, including ties and duplicates", () => {
    const btc = [200, 100, 100, 400, 250];
    const indexed = indexBtcTimestampsForNearestLookup(btc);
    const probes = [0, 100, 150, 175, 200, 225, 325, 500, 99, 400];
    for (const probe of probes) {
      expect(findNearestBtcDistanceMsIndexed(probe, indexed)).toBe(
        findNearestBtcDistanceMs(probe, btc),
      );
    }
  });
});
