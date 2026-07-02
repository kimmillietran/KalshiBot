import { describe, expect, it } from "vitest";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  discoverWalkForwardSplit,
  parseWalkForwardFoldJson,
} from "./discoverWalkForwardSplit";
import {
  WalkForwardSweepError,
  WalkForwardSweepErrorCode,
} from "./walkForwardSweepTypes";
import type { WalkForwardSweepFilesystem } from "./walkForwardSweepTypes";

const SPLIT_ID = "wf-test";
const SPLIT_ROOT = `data/walk-forward/${SPLIT_ID}`;
const SUMMARY_PATH = `${SPLIT_ROOT}/walk-forward-summary.json`;

function createFoldJson(
  foldIndex: number,
  validationMarkets: Array<{
    marketTicker: string;
    fixturePath: string;
    orderedIndex: number;
  }>,
): string {
  return stableStringify({
    foldIndex,
    splitId: SPLIT_ID,
    trainingMarkets: [],
    validationMarkets: validationMarkets.map((market) => ({
      seriesTicker: "KXBTC15M",
      marketTicker: market.marketTicker,
      fixturePath: market.fixturePath,
      marketCloseTime: "2026-06-26T23:15:00.000Z",
      registryPath: "data/research-datasets/KXBTC15M/dataset-registry.json",
      orderedIndex: market.orderedIndex,
    })),
    metadata: {
      trainingWindowSize: 4,
      validationWindowSize: validationMarkets.length,
      stepSize: 2,
      embargoMarketCount: 1,
      trainingStartIndex: 0,
      trainingEndIndex: 3,
      validationStartIndex: 5,
      validationEndIndex: 5 + validationMarkets.length - 1,
      trainingStartCloseTime: "2026-06-26T23:00:00.000Z",
      trainingEndCloseTime: "2026-06-26T23:03:00.000Z",
      validationStartCloseTime: "2026-06-26T23:05:00.000Z",
      validationEndCloseTime: "2026-06-26T23:07:00.000Z",
    },
  });
}

function createSummaryJson(folds: Array<{ foldIndex: number; outputPath: string }>): string {
  return stableStringify({
    splitId: SPLIT_ID,
    registryDir: "data/research-datasets",
    outputDir: "data/walk-forward",
    summaryPath: SUMMARY_PATH,
    generatedAt: "2026-06-27T12:00:00.000Z",
    config: {
      splitId: SPLIT_ID,
      trainingWindowSize: 4,
      validationWindowSize: 2,
      stepSize: 2,
      embargoMarketCount: 1,
      allowOverlappingValidationWindows: true,
    },
    orderedMarketCount: 10,
    foldCount: folds.length,
    folds,
  });
}

function createFilesystem(files: Record<string, string>): WalkForwardSweepFilesystem {
  return {
    exists: (path) => Object.prototype.hasOwnProperty.call(files, path),
    readFile: (path) => {
      const value = files[path];
      if (value === undefined) {
        throw new Error(`missing file: ${path}`);
      }
      return value;
    },
    writeFile: () => undefined,
    mkdir: () => undefined,
  };
}

describe("discoverWalkForwardSplit", () => {
  it("loads folds in deterministic order", () => {
    const fold0Path = `${SPLIT_ROOT}/folds/fold-000.json`;
    const fold1Path = `${SPLIT_ROOT}/folds/fold-001.json`;
    const filesystem = createFilesystem({
      [SPLIT_ROOT]: "dir",
      [SUMMARY_PATH]: createSummaryJson([
        { foldIndex: 0, outputPath: fold0Path },
        { foldIndex: 1, outputPath: fold1Path },
      ]),
      [fold0Path]: createFoldJson(0, [
        {
          marketTicker: "KXBTC15M-MARKET-A",
          fixturePath: "data/fixtures/KXBTC15M/MARKET-A/fixture.json",
          orderedIndex: 5,
        },
      ]),
      [fold1Path]: createFoldJson(1, [
        {
          marketTicker: "KXBTC15M-MARKET-B",
          fixturePath: "data/fixtures/KXBTC15M/MARKET-B/fixture.json",
          orderedIndex: 7,
        },
      ]),
    });

    const split = discoverWalkForwardSplit(SPLIT_ID, "data/walk-forward", filesystem);

    expect(split.folds.map((fold) => fold.foldIndex)).toEqual([0, 1]);
    expect(split.folds[0]?.validationMarkets[0]?.marketTicker).toBe("KXBTC15M-MARKET-A");
  });

  it("rejects missing split directories", () => {
    expect(() =>
      discoverWalkForwardSplit(SPLIT_ID, "data/walk-forward", createFilesystem({})),
    ).toThrow(WalkForwardSweepError);

    try {
      discoverWalkForwardSplit(SPLIT_ID, "data/walk-forward", createFilesystem({}));
    } catch (error) {
      expect((error as WalkForwardSweepError).code).toBe(
        WalkForwardSweepErrorCode.MISSING_SPLIT_DIR,
      );
    }
  });

  it("rejects duplicate fold indices", () => {
    const foldPath = `${SPLIT_ROOT}/folds/fold-000.json`;
    const filesystem = createFilesystem({
      [SPLIT_ROOT]: "dir",
      [SUMMARY_PATH]: createSummaryJson([
        { foldIndex: 0, outputPath: foldPath },
        { foldIndex: 0, outputPath: foldPath },
      ]),
      [foldPath]: createFoldJson(0, [
        {
          marketTicker: "KXBTC15M-MARKET-A",
          fixturePath: "data/fixtures/KXBTC15M/MARKET-A/fixture.json",
          orderedIndex: 5,
        },
      ]),
    });

    expect(() =>
      discoverWalkForwardSplit(SPLIT_ID, "data/walk-forward", filesystem),
    ).toThrow(WalkForwardSweepError);
  });

  it("rejects empty validation sets", () => {
    const foldPath = `${SPLIT_ROOT}/folds/fold-000.json`;
    const filesystem = createFilesystem({
      [SPLIT_ROOT]: "dir",
      [SUMMARY_PATH]: createSummaryJson([{ foldIndex: 0, outputPath: foldPath }]),
      [foldPath]: createFoldJson(0, []),
    });

    expect(() =>
      discoverWalkForwardSplit(SPLIT_ID, "data/walk-forward", filesystem),
    ).toThrow(WalkForwardSweepError);

    try {
      discoverWalkForwardSplit(SPLIT_ID, "data/walk-forward", filesystem);
    } catch (error) {
      expect((error as WalkForwardSweepError).code).toBe(
        WalkForwardSweepErrorCode.EMPTY_VALIDATION_SET,
      );
    }
  });
});

describe("parseWalkForwardFoldJson", () => {
  it("parses fold validation markets", () => {
    const fold = parseWalkForwardFoldJson(
      createFoldJson(0, [
        {
          marketTicker: "KXBTC15M-MARKET-A",
          fixturePath: "data/fixtures/KXBTC15M/MARKET-A/fixture.json",
          orderedIndex: 5,
        },
      ]),
    );

    expect(fold.validationMarkets).toHaveLength(1);
    expect(fold.splitId).toBe(SPLIT_ID);
  });
});
