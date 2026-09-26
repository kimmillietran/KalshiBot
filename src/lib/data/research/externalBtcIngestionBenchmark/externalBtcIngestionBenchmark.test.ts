import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  applyTickIncremental,
  buildSyntheticWorkloads,
  compareQuoteStreams,
  createIncrementalBook,
  materializeWorkloadZstd,
  measureCachePrototype,
  replayBaselineAsync,
  replayFromLinesForParity,
  replaySyncBuffered,
} from "./index";

describe("externalBtcIngestionBenchmark", () => {
  it("builds snapshot-first synthetic workloads covering required stress cases", () => {
    const workloads = buildSyntheticWorkloads({
      typicalMessages: 200,
      deepMessages: 150,
    });
    expect(workloads["typical-depth"].lines[0]).toMatch(/^\[0,/);
    expect(workloads["deep-book-high-update"].messageCount).toBeGreaterThan(100);
    expect(workloads["away-from-best"].notes.join(" ")).toMatch(/away/);
    expect(workloads["best-price-changes"].notes.join(" ")).toMatch(/deletion/);
    expect(workloads["snapshot-reset-gap"].notes.join(" ")).toMatch(/gap/);
  });

  it("keeps incremental BBO semantically equal to baseline on synthetic lines", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ing-bench-"));
    try {
      const workload = buildSyntheticWorkloads({
        typicalMessages: 500,
        deepMessages: 400,
      })["snapshot-reset-gap"];
      const { path } = await materializeWorkloadZstd(
        workload,
        join(dir, "gap.txt.zst"),
      );
      const baseline = await replayBaselineAsync(path, {
        profiled: false,
        hashInputSeparately: true,
      });
      const incremental = replaySyncBuffered({
        path,
        mode: "incremental",
        profiled: false,
      });
      const parity = compareQuoteStreams(
        baseline.quotes,
        incremental.quotes,
        baseline.finalBookHashSha256,
        incremental.finalBookHashSha256,
      );
      expect(parity.matched).toBe(true);
      expect(parity.firstMismatch).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats best-level deletion and empty-side recovery correctly", () => {
    const book = createIncrementalBook();
    applyTickIncremental(book, {
      msgType: 0,
      prevEventId: "0",
      eventId: "1",
      adapterTimestampNs: 1e9,
      exchangeTimestampNs: 1e9,
      isSnapshot: true,
      levels: [
        [0, "0.40", "5", 1],
        [0, "0.39", "3", 1],
        [1, "0.42", "4", 1],
      ],
    });
    expect(book.bestBidPrice).toBe(0.4);
    applyTickIncremental(book, {
      msgType: 1,
      prevEventId: "1",
      eventId: "2",
      adapterTimestampNs: 2e9,
      exchangeTimestampNs: 2e9,
      levels: [[0, "0.40", "0", 1]],
    });
    expect(book.bestBidPrice).toBe(0.39);
    applyTickIncremental(book, {
      msgType: 1,
      prevEventId: "2",
      eventId: "3",
      adapterTimestampNs: 3e9,
      exchangeTimestampNs: 3e9,
      levels: [[0, "0.39", "0", 1]],
    });
    expect(book.bestBidPrice).toBeNull();
  });

  it("matches line-level parity helper for full-scan vs incremental", () => {
    const lines = buildSyntheticWorkloads({
      typicalMessages: 300,
      deepMessages: 200,
    })["best-price-changes"].lines;
    const full = replayFromLinesForParity(lines, "full-scan");
    const incr = replayFromLinesForParity(lines, "incremental");
    const parity = compareQuoteStreams(
      full.quotes,
      incr.quotes,
      full.finalBookHashSha256,
      incr.finalBookHashSha256,
    );
    expect(parity.matched).toBe(true);
  });

  it("prototypes sparse-quote cache write/read keyed by input hash", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ing-cache-"));
    try {
      const workload = buildSyntheticWorkloads({
        typicalMessages: 120,
        deepMessages: 80,
      })["away-from-best"];
      const { path, inputSha256 } = await materializeWorkloadZstd(
        workload,
        join(dir, "away.txt.zst"),
      );
      const replayed = replaySyncBuffered({
        path,
        mode: "incremental",
        profiled: false,
        hashDuringRead: true,
      });
      expect(replayed.inputSha256).toBe(inputSha256);
      const cache = measureCachePrototype({
        cacheDir: join(dir, "cache"),
        inputSha256: replayed.inputSha256,
        replayImplementation: "opt-sync-plus-incremental",
        firstIngestionWallMs: 100,
        quotes: replayed.quotes,
        outputHashSha256: replayed.outputHashSha256,
      });
      expect(cache.attempted).toBe(true);
      expect(cache.cacheBytes).toBeGreaterThan(0);
      expect(cache.cacheReadWallMs).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
