import { describe, expect, it } from "vitest";

import { buildBatchImportFailureAnalysis } from "./buildBatchImportFailureAnalysis";
import { categorizeBatchImportFailure } from "./categorizeBatchImportFailure";
import {
  BATCH_IMPORT_FAILURE_CATEGORY,
} from "./batchImportFailureAnalysisTypes";
import type { BatchImportMarketResult } from "./batchImportTypes";
import { serializeBatchImportFailureAnalysis } from "./serializeBatchImportFailureAnalysis";

function failedMarket(
  marketTicker: string,
  errorMessage: string,
  configPath = `data/import-configs/${marketTicker}/config.json`,
): BatchImportMarketResult {
  return {
    marketTicker,
    configPath,
    outputPath: `data/imports/KXBTC15M/${marketTicker}/import-result.json`,
    status: "failed",
    errorMessage,
    jobId: `import-${marketTicker}`,
    bronzeRecordCount: null,
    valid: null,
  };
}

describe("categorizeBatchImportFailure", () => {
  it("maps known error messages to deterministic categories", () => {
    expect(categorizeBatchImportFailure("Kalshi API rate limit exceeded")).toBe(
      BATCH_IMPORT_FAILURE_CATEGORY.RATE_LIMITED,
    );
    expect(categorizeBatchImportFailure("market not found")).toBe(
      BATCH_IMPORT_FAILURE_CATEGORY.MARKET_NOT_FOUND,
    );
    expect(categorizeBatchImportFailure("no historical candles returned")).toBe(
      BATCH_IMPORT_FAILURE_CATEGORY.NO_HISTORICAL_DATA,
    );
    expect(categorizeBatchImportFailure("jobId is required")).toBe(
      BATCH_IMPORT_FAILURE_CATEGORY.INVALID_METADATA,
    );
  });
});

describe("buildBatchImportFailureAnalysis", () => {
  it("returns an empty analysis for a summary with no failures", () => {
    const analysis = buildBatchImportFailureAnalysis({
      totalConfigs: 0,
      successfulImports: 0,
      failedImports: 0,
      failedMarkets: [],
    });

    expect(analysis).toEqual({
      totalConfigs: 0,
      successfulImports: 0,
      failedImports: 0,
      failureReasons: [],
      recoverableFailures: 0,
      unrecoverableFailures: 0,
      recommendations: ["No failed imports detected; no remediation required."],
    });
  });

  it("groups mixed failures with counts, percentages, and examples", () => {
    const analysis = buildBatchImportFailureAnalysis({
      totalConfigs: 5,
      successfulImports: 2,
      failedImports: 3,
      failedMarkets: [
        failedMarket("MKT-A", "HTTP 429 rate limit exceeded"),
        failedMarket("MKT-B", "market not found"),
        failedMarket("MKT-C", "jobId is required"),
        {
          marketTicker: "MKT-OK",
          configPath: "data/import-configs/MKT-OK/config.json",
          outputPath: "data/imports/KXBTC15M/MKT-OK/import-result.json",
          status: "success",
          errorMessage: null,
          jobId: "import-MKT-OK",
          bronzeRecordCount: 4,
          valid: true,
        },
      ],
    });

    expect(analysis.failureReasons).toHaveLength(3);
    expect(analysis.failureReasons.map((group) => group.code)).toEqual([
      BATCH_IMPORT_FAILURE_CATEGORY.INVALID_METADATA,
      BATCH_IMPORT_FAILURE_CATEGORY.MARKET_NOT_FOUND,
      BATCH_IMPORT_FAILURE_CATEGORY.RATE_LIMITED,
    ]);
    expect(
      analysis.failureReasons.find(
        (group) => group.code === BATCH_IMPORT_FAILURE_CATEGORY.RATE_LIMITED,
      ),
    ).toMatchObject({
      count: 1,
      percentage: 33.33,
    });
    expect(analysis.recoverableFailures).toBe(1);
    expect(analysis.unrecoverableFailures).toBe(2);
    expect(
      analysis.failureReasons
        .find((group) => group.code === BATCH_IMPORT_FAILURE_CATEGORY.RATE_LIMITED)
        ?.examples[0]?.marketTicker,
    ).toBe("MKT-A");
  });

  it("orders failure reasons by count descending then code", () => {
    const analysis = buildBatchImportFailureAnalysis({
      totalConfigs: 4,
      successfulImports: 0,
      failedImports: 4,
      failedMarkets: [
        failedMarket("MKT-1", "market not found"),
        failedMarket("MKT-2", "market not found"),
        failedMarket("MKT-3", "HTTP 429 rate limit exceeded"),
        failedMarket("MKT-4", "jobId is required"),
      ],
    });

    expect(analysis.failureReasons.map((group) => group.code)).toEqual([
      BATCH_IMPORT_FAILURE_CATEGORY.MARKET_NOT_FOUND,
      BATCH_IMPORT_FAILURE_CATEGORY.INVALID_METADATA,
      BATCH_IMPORT_FAILURE_CATEGORY.RATE_LIMITED,
    ]);
  });

  it("serializes deterministically", () => {
    const input = {
      totalConfigs: 2,
      successfulImports: 0,
      failedImports: 2,
      failedMarkets: [
        failedMarket("MKT-B", "network timeout"),
        failedMarket("MKT-A", "network timeout"),
      ],
    };

    const first = serializeBatchImportFailureAnalysis(
      buildBatchImportFailureAnalysis(input),
    );
    const second = serializeBatchImportFailureAnalysis(
      buildBatchImportFailureAnalysis(input),
    );

    expect(first).toBe(second);
    expect(first).toContain('"code":"network-failure"');
  });

  it("emits recommendations for dominant failure categories", () => {
    const analysis = buildBatchImportFailureAnalysis({
      totalConfigs: 10,
      successfulImports: 0,
      failedImports: 10,
      failedMarkets: Array.from({ length: 10 }, (_, index) =>
        failedMarket(`MKT-${index}`, "HTTP 429 rate limit exceeded"),
      ),
    });

    expect(analysis.recommendations.some((entry) => entry.includes("concurrency"))).toBe(
      true,
    );
    expect(analysis.recommendations.some((entry) => entry.includes("import:batch"))).toBe(
      true,
    );
  });
});
