import { describe, expect, it } from "vitest";

import type { ExpansionImportMarketResult } from "./expansionExecutorTypes";
import {
  assertExpansionImportJobSummaryInvariants,
  collectFirstExpansionImportFailureMessages,
  countExpansionImportAttempts,
  formatExpansionImportAbortGuardLines,
  isExpansionImportAbortGuardTriggered,
} from "./summarizeExpansionImportJobResults";

function result(
  status: ExpansionImportMarketResult["status"],
  ticker: string,
  errorMessage: string | null = null,
): ExpansionImportMarketResult {
  return {
    marketTicker: ticker,
    seriesTicker: "KXBTC15M",
    status,
    configPath: null,
    importResultPath: null,
    errorMessage,
    skipReason: null,
    durationMs: 1,
  };
}

describe("countExpansionImportAttempts", () => {
  it("counts attempted outcomes from the planned queue only", () => {
    const counts = countExpansionImportAttempts([
      result("imported", "A"),
      result("failed", "B", "boom"),
      result("skipped", "C"),
    ]);

    expect(counts).toEqual({
      importedCount: 1,
      failedCount: 1,
      skippedCount: 1,
      plannedStatusCount: 0,
      attemptedCount: 3,
    });
  });
});

describe("assertExpansionImportJobSummaryInvariants", () => {
  it("rejects failed execute results with an empty planned queue", () => {
    expect(() =>
      assertExpansionImportJobSummaryInvariants({
        plannedQueueLength: 0,
        attemptedResults: [result("failed", "A", "boom")],
        budgetAtPlanning: 10,
        execute: true,
      }),
    ).toThrow("exceeds planned queue length");
  });
});

describe("isExpansionImportAbortGuardTriggered", () => {
  it("triggers when every planned market failed during execute", () => {
    expect(
      isExpansionImportAbortGuardTriggered({
        plannedQueueLength: 3,
        importedCount: 0,
        failedCount: 3,
        execute: true,
      }),
    ).toBe(true);
  });

  it("does not trigger during dry-run or when imports succeeded", () => {
    expect(
      isExpansionImportAbortGuardTriggered({
        plannedQueueLength: 3,
        importedCount: 0,
        failedCount: 3,
        execute: false,
      }),
    ).toBe(false);
    expect(
      isExpansionImportAbortGuardTriggered({
        plannedQueueLength: 3,
        importedCount: 1,
        failedCount: 2,
        execute: true,
      }),
    ).toBe(false);
  });
});

describe("formatExpansionImportAbortGuardLines", () => {
  it("includes the first three failure messages", () => {
    const lines = formatExpansionImportAbortGuardLines([
      "MKT-A: missing fields",
      "MKT-B: timeout",
      "MKT-C: invalid payload",
      "MKT-D: ignored",
    ]);

    expect(lines.join("\n")).toContain("ABORT");
    expect(lines.join("\n")).toContain("MKT-A: missing fields");
    expect(lines.join("\n")).toContain("MKT-C: invalid payload");
    expect(lines.join("\n")).not.toContain("MKT-D");
  });
});

describe("collectFirstExpansionImportFailureMessages", () => {
  it("collects ticker-prefixed failure messages", () => {
    expect(
      collectFirstExpansionImportFailureMessages([
        result("failed", "MKT-A", "boom"),
        result("imported", "MKT-B"),
      ]),
    ).toEqual(["MKT-A: boom"]);
  });
});
