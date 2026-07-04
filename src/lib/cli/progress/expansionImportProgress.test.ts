import { describe, expect, it, vi } from "vitest";

import {
  createExpansionImportProgressReporter,
  formatExpansionImportJobHeaderLines,
  formatExpansionImportMarketProgressLines,
  formatExpansionImportWindowLabel,
} from "./expansionImportProgress";

describe("formatExpansionImportJobHeaderLines", () => {
  it("labels dry-run output and includes discovery counts", () => {
    const lines = formatExpansionImportJobHeaderLines({
      dryRun: true,
      resume: false,
      maxMarkets: null,
      jobIndex: 1,
      totalJobs: 1,
      jobId: "expansion-KXBTC15M-20260101-20260331",
      seriesTicker: "KXBTC15M",
      windowLabel: "2026-01-01 → 2026-03-31",
      discoveredCount: 480,
      alreadyCoveredCount: 120,
      toImportCount: 25,
    });

    expect(lines.join("\n")).toContain("[Expansion Import] DRY RUN");
    expect(lines.join("\n")).toContain("Job 1/1: expansion-KXBTC15M-20260101-20260331");
    expect(lines.join("\n")).toContain("Discovered: 480 markets | Already covered: 120 | To import: 25");
    expect(lines.join("\n")).not.toContain("Import cap:");
  });

  it("shows max-markets cap and resume status when configured", () => {
    const lines = formatExpansionImportJobHeaderLines({
      dryRun: false,
      resume: true,
      maxMarkets: 5,
      jobIndex: 1,
      totalJobs: 2,
      jobId: "expansion-KXBTC15M-20260101-20260331",
      seriesTicker: "KXBTC15M",
      windowLabel: "2026-01-01 → 2026-03-31",
      discoveredCount: 10,
      alreadyCoveredCount: 3,
      toImportCount: 5,
    });

    expect(lines.join("\n")).toContain("[Expansion Import]");
    expect(lines.join("\n")).not.toContain("DRY RUN");
    expect(lines.join("\n")).toContain("Import cap: 5 markets (--max-markets)");
    expect(lines.join("\n")).toContain("Resume: enabled");
  });
});

describe("formatExpansionImportMarketProgressLines", () => {
  it("shows imported counts during execute mode", () => {
    const lines = formatExpansionImportMarketProgressLines({
      dryRun: false,
      completedMarkets: 10,
      totalMarkets: 25,
      currentMarketTicker: "KXBTC15M-26JAN01-BTC-00",
      importedCount: 9,
      plannedCount: 0,
      failedCount: 0,
      skippedCount: 1,
      elapsedMs: 102_000,
    });

    const output = lines.join("\n");
    expect(output).toContain("10/25 markets");
    expect(output).toContain("KXBTC15M-26JAN01-BTC-00");
    expect(output).toContain("Imported: 9 | Failed: 0 | Skipped: 1");
    expect(output).toContain("Elapsed: 01:42");
    expect(output).toContain("ETA:");
  });

  it("shows planned counts during dry-run mode", () => {
    const lines = formatExpansionImportMarketProgressLines({
      dryRun: true,
      completedMarkets: 2,
      totalMarkets: 4,
      currentMarketTicker: "KXBTC15M-26JAN02-BTC-00",
      importedCount: 0,
      plannedCount: 2,
      failedCount: 0,
      skippedCount: 0,
      elapsedMs: 30_000,
    });

    expect(lines.join("\n")).toContain("Planned: 2 | Failed: 0 | Skipped: 0");
  });

  it("shows failure counts when imports fail", () => {
    const lines = formatExpansionImportMarketProgressLines({
      dryRun: false,
      completedMarkets: 3,
      totalMarkets: 3,
      currentMarketTicker: "KXBTC15M-26JAN03-BTC-00",
      importedCount: 1,
      plannedCount: 0,
      failedCount: 2,
      skippedCount: 0,
      elapsedMs: 45_000,
    });

    expect(lines.join("\n")).toContain("Imported: 1 | Failed: 2 | Skipped: 0");
  });
});

describe("formatExpansionImportWindowLabel", () => {
  it("formats ISO window timestamps as calendar dates", () => {
    expect(
      formatExpansionImportWindowLabel(
        "2026-01-01T00:00:00.000Z",
        "2026-03-31T23:59:59.999Z",
      ),
    ).toBe("2026-01-01 → 2026-03-31");
  });
});

describe("createExpansionImportProgressReporter", () => {
  it("writes job header once and throttles duplicate market updates in non-tty mode", () => {
    const write = vi.fn();
    const reporter = createExpansionImportProgressReporter({
      startedAtMs: 1_000,
      isTty: false,
      nonTtyUpdateEvery: 1,
      write,
      now: () => 2_000,
    });

    reporter.reportJobHeader({
      dryRun: true,
      resume: false,
      maxMarkets: null,
      jobIndex: 1,
      totalJobs: 1,
      jobId: "expansion-KXBTC15M-20260101-20260331",
      seriesTicker: "KXBTC15M",
      windowLabel: "2026-01-01 → 2026-03-31",
      discoveredCount: 2,
      alreadyCoveredCount: 0,
      toImportCount: 2,
    });
    reporter.recordMarket("planned", "KXBTC15M-A");
    reporter.recordMarket("planned", "KXBTC15M-B");
    reporter.completeJob();

    const output = write.mock.calls.map(([chunk]) => chunk).join("");
    expect(output.match(/\[Expansion Import\] DRY RUN/g)?.length).toBe(1);
    expect(output).toContain("Planned: 2");
    expect(output).toContain("2/2 markets");
  });
});
