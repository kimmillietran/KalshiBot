import { describe, expect, it, vi } from "vitest";

import {
  createStrategySweepProgressReporter,
  formatStrategySweepProgressLines,
} from "./strategySweepProgress";

describe("formatStrategySweepProgressLines", () => {
  it("includes sweep counters and current job context", () => {
    const lines = formatStrategySweepProgressLines({
      completedJobs: 1098,
      totalJobs: 3000,
      totalMarkets: 500,
      totalStrategies: 6,
      marketsFullyComplete: 183,
      successfulJobs: 1090,
      failedJobs: 8,
      outputsWritten: 1090,
      currentStrategyId: "buy-below-probability",
      currentMarketTicker: "KXBTC15M-26APR301900-00",
      elapsedMs: 192_000,
    });

    const output = lines.join("\n");
    expect(output).toContain("[Sweep]");
    expect(output).toContain("183 / 500");
    expect(output).toContain("6 / 6");
    expect(output).toContain("1098 / 3000");
    expect(output).toContain("buy-below-probability");
    expect(output).toContain("KXBTC15M-26APR301900-00");
    expect(output).toContain("Elapsed:");
    expect(output).toContain("03:12");
    expect(output).toContain("Research outputs written:");
    expect(output).toContain("1090");
  });
});

describe("createStrategySweepProgressReporter", () => {
  it("counts fully completed markets across strategies", () => {
    const write = vi.fn();
    const reporter = createStrategySweepProgressReporter({
      totalJobs: 4,
      totalMarkets: 2,
      strategyIds: ["alpha", "beta"],
      startedAtMs: 0,
      isTty: false,
      nonTtyUpdateEvery: 1,
      write,
      now: () => 5_000,
    });

    reporter.recordJob({
      strategyId: "alpha",
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-A",
      status: "success",
    });
    reporter.recordJob({
      strategyId: "beta",
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-A",
      status: "success",
    });
    reporter.recordJob({
      strategyId: "alpha",
      seriesTicker: "KXBTC15M",
      marketTicker: "MKT-B",
      status: "failed",
    });
    reporter.complete();

    const output = write.mock.calls.map(([chunk]) => chunk).join("");
    expect(output).toContain("Markets:");
    expect(output).toContain("1 / 2");
    expect(output).toContain("Research outputs written:");
    expect(output).toContain("2");
  });
});
