import { describe, expect, it, vi } from "vitest";

import {
  createBatchImportProgressReporter,
  formatBatchImportProgressLines,
} from "./batchImportProgress";

describe("formatBatchImportProgressLines", () => {
  it("includes progress bar, counters, and timing fields", () => {
    const lines = formatBatchImportProgressLines({
      completedMarkets: 182,
      totalMarkets: 500,
      currentMarketTicker: "KXBTC15M-26APR301900-00",
      successCount: 176,
      recoveredCount: 4,
      failedCount: 2,
      skippedCount: 0,
      rateLimitCount: 7,
      currentDelayMs: 250,
      elapsedMs: 102_000,
    });

    expect(lines.join("\n")).toContain("[Import]");
    expect(lines.join("\n")).toContain("182 / 500 (36%)");
    expect(lines.join("\n")).toContain("KXBTC15M-26APR301900-00");
    expect(lines.join("\n")).toContain("Recovered: 4");
    expect(lines.join("\n")).toContain("429s: 7");
    expect(lines.join("\n")).toContain("Elapsed: 01:42");
    expect(lines.join("\n")).toContain("Current delay: 250 ms");
  });
});

describe("createBatchImportProgressReporter", () => {
  it("tracks recovered imports and rate limits", () => {
    const write = vi.fn();
    const reporter = createBatchImportProgressReporter({
      totalMarkets: 2,
      startedAtMs: 1_000,
      isTty: false,
      nonTtyUpdateEvery: 1,
      write,
      now: () => 2_000,
    });

    reporter.recordMarket(
      { status: "success", retryCount: 2, rateLimited: true },
      "KXBTC15M-A",
      250,
    );
    reporter.complete();

    const output = write.mock.calls.map(([chunk]) => chunk).join("");
    expect(output).toContain("Recovered: 1");
    expect(output).toContain("429s: 1");
    expect(output).toContain("Success: 1");
  });
});
