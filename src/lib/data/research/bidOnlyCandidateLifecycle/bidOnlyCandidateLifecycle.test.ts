import { describe, expect, it } from "vitest";

import { buildBidOnlyCandidateEpisodes } from "./buildBidOnlyCandidateEpisodes";
import { buildBidOnlyCandidateLifecycleReport } from "./buildBidOnlyCandidateLifecycleReport";
import { classifyCandidateEpisode } from "./classifyCandidateLifecycle";
import { createBidOnlyCandidateLifecycleConfig } from "./bidOnlyCandidateLifecycleConfig";
import type { BidOnlyCandidateLifecycleIo, BidOnlyClassifiedRecord } from "./bidOnlyCandidateLifecycleTypes";
import { loadBidOnlyParityInputs } from "./loadBidOnlyParityInputs";
import { serializeBidOnlyCandidateLifecycleHtml } from "./serializeBidOnlyCandidateLifecycleHtml";

const INPUT_DIR = "data/live-capture/forward-quotes";

function buildMemoryIo(files: Record<string, string>): BidOnlyCandidateLifecycleIo {
  const normalizedFiles = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path.replace(/\\/g, "/"), content]),
  );
  const directories = new Set<string>();

  for (const path of Object.keys(normalizedFiles)) {
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/"));
    }
  }

  return {
    readFile: (path) => normalizedFiles[path.replace(/\\/g, "/")] ?? "",
    fileExists: (path) => {
      const normalized = path.replace(/\\/g, "/");
      return normalized in normalizedFiles || directories.has(normalized);
    },
    readdir: (path) => {
      const prefix = `${path.replace(/\\/g, "/").replace(/\/$/, "")}/`;
      const children = new Set<string>();
      for (const filePath of Object.keys(normalizedFiles)) {
        if (!filePath.startsWith(prefix)) {
          continue;
        }
        const child = filePath.slice(prefix.length).split("/")[0];
        if (child) {
          children.add(child);
        }
      }
      return [...children];
    },
    isDirectory: (path) => directories.has(path.replace(/\\/g, "/")),
  };
}

function topOfBookLine(input: {
  receivedAtLocal: string;
  yesBid?: number;
  noBid?: number;
  yesBidSize?: number;
  noBidSize?: number;
  marketTicker?: string;
}): string {
  return JSON.stringify({
    runId: "run-1",
    marketTicker: input.marketTicker ?? "KXBTC15M-TEST",
    eventTicker: "KXBTC15M-EVENT",
    receivedAtLocal: input.receivedAtLocal,
    bookState: "valid",
    yesBestBidCents: input.yesBid ?? 55,
    yesBestAskCents: null,
    noBestBidCents: input.noBid ?? 55,
    noBestAskCents: null,
    yesBestBidSize: input.yesBidSize ?? 10,
    noBestBidSize: input.noBidSize ?? 10,
  });
}

function createRunFiles(runId: string, lines: string[], extras: Record<string, string> = {}) {
  const runDir = `${INPUT_DIR}/${runId}`;
  return {
    [`${runDir}/capture-health.json`]: JSON.stringify({ runId }),
    [`${runDir}/top-of-book.jsonl`]: lines.join("\n"),
    ...extras,
  };
}

describe("bidOnlyCandidateLifecycle", () => {
  it("builds a single gross-candidate episode", () => {
    const files = createRunFiles("single-episode", [
      topOfBookLine({ receivedAtLocal: "2026-07-10T00:00:00.000Z", yesBid: 52, noBid: 53 }),
      topOfBookLine({ receivedAtLocal: "2026-07-10T00:00:02.000Z", yesBid: 52, noBid: 53 }),
    ]);

    const loaded = loadBidOnlyParityInputs({
      config: createBidOnlyCandidateLifecycleConfig({ minEpisodeDurationMs: 1 }),
      io: buildMemoryIo(files),
    });
    const episodes = buildBidOnlyCandidateEpisodes(loaded.runs, createBidOnlyCandidateLifecycleConfig({
      minEpisodeDurationMs: 1,
      requireExecutableConfirmation: false,
    }));

    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.recordCount).toBe(2);
    expect(episodes[0]?.maxBidOnlyEdgeCents).toBeGreaterThan(0);
    expect(episodes[0]?.episodeClassification).toBe("gross-candidate-episode");
  });

  it("splits episodes by time gap", () => {
    const files = createRunFiles("gap-split", [
      topOfBookLine({ receivedAtLocal: "2026-07-10T00:00:00.000Z" }),
      topOfBookLine({ receivedAtLocal: "2026-07-10T00:00:10.000Z" }),
    ]);

    const loaded = loadBidOnlyParityInputs({
      config: createBidOnlyCandidateLifecycleConfig(),
      io: buildMemoryIo(files),
    });
    const episodes = buildBidOnlyCandidateEpisodes(
      loaded.runs,
      createBidOnlyCandidateLifecycleConfig({ maxGapMs: 2_500, minEpisodeDurationMs: 1 }),
    );

    expect(episodes).toHaveLength(2);
  });

  it("splits episodes by market", () => {
    const files = createRunFiles("market-split", [
      topOfBookLine({ receivedAtLocal: "2026-07-10T00:00:00.000Z", marketTicker: "MKT-A" }),
      topOfBookLine({ receivedAtLocal: "2026-07-10T00:00:01.000Z", marketTicker: "MKT-B" }),
    ]);

    const loaded = loadBidOnlyParityInputs({
      config: createBidOnlyCandidateLifecycleConfig(),
      io: buildMemoryIo(files),
    });
    const episodes = buildBidOnlyCandidateEpisodes(
      loaded.runs,
      createBidOnlyCandidateLifecycleConfig({ minEpisodeDurationMs: 1 }),
    );

    expect(episodes).toHaveLength(2);
    expect(new Set(episodes.map((episode) => episode.marketTicker)).size).toBe(2);
  });

  it("splits episodes by classification family", () => {
    const files = createRunFiles("class-split", [
      topOfBookLine({ receivedAtLocal: "2026-07-10T00:00:00.000Z", yesBid: 45, noBid: 45 }),
      topOfBookLine({ receivedAtLocal: "2026-07-10T00:00:01.000Z", yesBid: 55, noBid: 55 }),
    ]);

    const loaded = loadBidOnlyParityInputs({
      config: createBidOnlyCandidateLifecycleConfig(),
      io: buildMemoryIo(files),
    });
    const episodes = buildBidOnlyCandidateEpisodes(
      loaded.runs,
      createBidOnlyCandidateLifecycleConfig({ minEpisodeDurationMs: 1 }),
    );

    expect(episodes.length).toBeGreaterThanOrEqual(2);
    expect(new Set(episodes.map((episode) => episode.classificationFamily)).size).toBeGreaterThan(1);
  });

  it("aggregates duration and edge metrics", () => {
    const files = createRunFiles("metrics-run", [
      topOfBookLine({ receivedAtLocal: "2026-07-10T00:00:00.000Z" }),
      topOfBookLine({ receivedAtLocal: "2026-07-10T00:00:05.000Z" }),
    ]);

    const report = buildBidOnlyCandidateLifecycleReport({
      generatedAt: "2026-07-10T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      config: createBidOnlyCandidateLifecycleConfig({
        minEpisodeDurationMs: 1,
        maxGapMs: 10_000,
      }),
      io: buildMemoryIo(files),
    });

    expect(report.metrics.episodesBuilt).toBeGreaterThan(0);
    expect(report.metrics.medianEpisodeDurationMs).toBeGreaterThan(0);
    expect(report.metrics.maxEdgeCents).toBeGreaterThan(0);
  });

  it("aggregates size metrics", () => {
    const files = createRunFiles("size-run", [
      topOfBookLine({
        receivedAtLocal: "2026-07-10T00:00:00.000Z",
        yesBidSize: 5,
        noBidSize: 8,
      }),
    ]);

    const loaded = loadBidOnlyParityInputs({
      config: createBidOnlyCandidateLifecycleConfig(),
      io: buildMemoryIo(files),
    });
    const episodes = buildBidOnlyCandidateEpisodes(
      loaded.runs,
      createBidOnlyCandidateLifecycleConfig({ minEpisodeDurationMs: 1 }),
    );

    expect(episodes[0]?.minBidSizeContracts).toBe(5);
    expect(episodes[0]?.maxBidSizeContracts).toBe(5);
  });

  it("classifies persistent candidate episodes", () => {
    const records: BidOnlyClassifiedRecord[] = Array.from({ length: 4 }, (_, index) => ({
      runId: "run",
      marketTicker: "MKT",
      eventTicker: null,
      receivedAtLocal: new Date(Date.parse("2026-07-10T00:00:00.000Z") + index * 3_000).toISOString(),
      receivedAtMs: Date.parse("2026-07-10T00:00:00.000Z") + index * 3_000,
      classification: "bid-only-gross-candidate",
      classificationFamily: "gross-candidate",
      bidSumCents: 110,
      bidOnlyEdgeCents: 10,
      estimatedNetEdgeCents: 6,
      minBidSizeContracts: 10,
      requiresExecutableConfirmation: true,
      reason: "test",
    }));

    const episode = {
      episodeId: "ep",
      runId: "run",
      marketTicker: "MKT",
      eventTicker: null,
      classificationFamily: "gross-candidate",
      episodeClassification: "no-candidate" as const,
      startedAt: records[0]!.receivedAtLocal,
      endedAt: records[records.length - 1]!.receivedAtLocal,
      durationMs: 9_000,
      recordCount: 4,
      maxBidOnlyEdgeCents: 10,
      meanBidOnlyEdgeCents: 10,
      medianBidOnlyEdgeCents: 10,
      p95BidOnlyEdgeCents: 10,
      minBidSizeContracts: 10,
      medianBidSizeContracts: 10,
      maxBidSizeContracts: 10,
      firstBidSumCents: 110,
      lastBidSumCents: 110,
      edgeStabilityScore: 1,
      sizeStabilityScore: 1,
      gapCount: 3,
      maxGapMs: 3_000,
      btcStartPrice: null,
      btcEndPrice: null,
      btcMoveDuringEpisode: null,
      btcMoveBucket: "unknown" as const,
      timeToCloseAtStartMs: null,
      timeToCloseAtEndMs: null,
      timeToCloseBucket: "unknown" as const,
      requiresExecutableConfirmation: true,
    };

    expect(
      classifyCandidateEpisode(
        episode,
        records,
        createBidOnlyCandidateLifecycleConfig({
          persistentEpisodeDurationMs: 8_000,
          persistentEpisodeMinRecords: 3,
        }),
      ),
    ).toBe("persistent-candidate-episode");
  });

  it("joins optional BTC spot prices", () => {
    const runDir = `${INPUT_DIR}/btc-run`;
    const files = {
      [`${runDir}/capture-health.json`]: JSON.stringify({ runId: "btc-run" }),
      [`${runDir}/top-of-book.jsonl`]: topOfBookLine({ receivedAtLocal: "2026-07-10T00:00:00.000Z" }),
      [`${runDir}/btc-spot.jsonl`]: JSON.stringify({
        receivedAtLocal: "2026-07-10T00:00:00.000Z",
        exchangeTimestampMs: Date.parse("2026-07-10T00:00:00.000Z"),
        priceUsd: 100_000,
      }),
    };

    const loaded = loadBidOnlyParityInputs({
      config: createBidOnlyCandidateLifecycleConfig(),
      io: buildMemoryIo(files),
    });
    const episodes = buildBidOnlyCandidateEpisodes(
      loaded.runs,
      createBidOnlyCandidateLifecycleConfig({ minEpisodeDurationMs: 1 }),
    );

    expect(episodes[0]?.btcStartPrice).toBe(100_000);
  });

  it("uses optional market metadata for time-to-close", () => {
    const runDir = `${INPUT_DIR}/ttc-run`;
    const closeTime = "2026-07-10T00:04:00.000Z";
    const files = {
      [`${runDir}/capture-health.json`]: JSON.stringify({ runId: "ttc-run" }),
      [`${runDir}/top-of-book.jsonl`]: topOfBookLine({ receivedAtLocal: "2026-07-10T00:00:00.000Z" }),
      [`${runDir}/market-metadata.jsonl`]: JSON.stringify({
        marketTicker: "KXBTC15M-TEST",
        closeTime,
      }),
    };

    const loaded = loadBidOnlyParityInputs({
      config: createBidOnlyCandidateLifecycleConfig(),
      io: buildMemoryIo(files),
    });
    const episodes = buildBidOnlyCandidateEpisodes(
      loaded.runs,
      createBidOnlyCandidateLifecycleConfig({ minEpisodeDurationMs: 1 }),
    );

    expect(episodes[0]?.timeToCloseBucket).toBe("3-5m");
  });

  it("skips malformed JSONL with warning", () => {
    const files = createRunFiles("malformed", [
      "{bad",
      topOfBookLine({ receivedAtLocal: "2026-07-10T00:00:00.000Z" }),
    ]);

    const loaded = loadBidOnlyParityInputs({
      config: createBidOnlyCandidateLifecycleConfig(),
      io: buildMemoryIo(files),
    });

    expect(loaded.runs[0]?.malformedLineCount).toBe(1);
    expect(loaded.warnings.some((warning) => warning.includes("malformed"))).toBe(true);
  });

  it("handles large runs without crashing", () => {
    const lines = Array.from({ length: 2_000 }, (_, index) =>
      topOfBookLine({
        receivedAtLocal: new Date(Date.parse("2026-07-10T00:00:00.000Z") + index * 1_000).toISOString(),
        yesBid: index % 20 === 0 ? 45 : 55,
        noBid: index % 20 === 0 ? 45 : 55,
      }),
    );

    const report = buildBidOnlyCandidateLifecycleReport({
      generatedAt: "2026-07-10T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      io: buildMemoryIo(createRunFiles("large-run", lines)),
    });

    expect(report.metrics.recordsScanned).toBe(2_000);
    expect(report.metrics.episodesBuilt).toBeGreaterThan(0);
  });

  it("serializes HTML containing disclaimer", () => {
    const report = buildBidOnlyCandidateLifecycleReport({
      generatedAt: "2026-07-10T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      io: buildMemoryIo(createRunFiles("html-run", [
        topOfBookLine({ receivedAtLocal: "2026-07-10T00:00:00.000Z" }),
      ])),
      config: createBidOnlyCandidateLifecycleConfig({ minEpisodeDurationMs: 1 }),
    });

    const html = serializeBidOnlyCandidateLifecycleHtml(report);
    expect(html).toContain("offline diagnostic windows");
    expect(html).toContain("not trade recommendations");
    expect(html).toContain("Executable confirmation is required");
  });
});
