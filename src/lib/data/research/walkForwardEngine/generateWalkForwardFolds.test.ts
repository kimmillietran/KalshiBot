import { describe, expect, it } from "vitest";

import { WalkForwardSplitError, WalkForwardSplitErrorCode } from "./walkForwardSplitErrors";
import { generateWalkForwardFolds } from "./generateWalkForwardFolds";
import { serializeWalkForwardFold } from "./serializeWalkForwardSplit";
import type {
  WalkForwardRegistryMarket,
  WalkForwardSplitDefinition,
} from "./walkForwardSplitTypes";

function createMarket(
  index: number,
  overrides: Partial<WalkForwardRegistryMarket> = {},
): WalkForwardRegistryMarket {
  const minute = String(index % 60).padStart(2, "0");
  return {
    seriesTicker: "KXBTC15M",
    marketTicker: `KXBTC15M-WF-${String(index).padStart(3, "0")}`,
    fixturePath: `data/fixtures/KXBTC15M/KXBTC15M-WF-${String(index).padStart(3, "0")}/fixture.json`,
    marketCloseTime: `2026-06-26T23:${minute}:00.000Z`,
    registryPath: "data/research-datasets/KXBTC15M/dataset-registry.json",
    ...overrides,
  };
}

function createMarkets(count: number): WalkForwardRegistryMarket[] {
  return Array.from({ length: count }, (_, index) => createMarket(index));
}

function createConfig(
  overrides: Partial<WalkForwardSplitDefinition> = {},
): WalkForwardSplitDefinition {
  return {
    splitId: "wf-6.27a",
    trainingWindowSize: 10,
    validationWindowSize: 3,
    stepSize: 3,
    embargoMarketCount: 1,
    allowOverlappingValidationWindows: true,
    ...overrides,
  };
}

describe("generateWalkForwardFolds", () => {
  it("orders markets by close time before generating folds", () => {
    const markets = [
      createMarket(2, { marketCloseTime: "2026-06-26T23:30:00.000Z" }),
      createMarket(0, { marketCloseTime: "2026-06-26T23:10:00.000Z" }),
      createMarket(1, { marketCloseTime: "2026-06-26T23:20:00.000Z" }),
    ];

    const folds = generateWalkForwardFolds(
      markets,
      createConfig({
        trainingWindowSize: 1,
        validationWindowSize: 1,
        stepSize: 2,
        embargoMarketCount: 0,
      }),
    );

    expect(folds).toHaveLength(1);
    expect(folds[0]?.trainingMarkets.map((market) => market.marketTicker)).toEqual([
      "KXBTC15M-WF-000",
    ]);
    expect(folds[0]?.validationMarkets.map((market) => market.marketTicker)).toEqual([
      "KXBTC15M-WF-001",
    ]);
  });

  it("generates rolling folds with embargo between train and validation", () => {
    const folds = generateWalkForwardFolds(createMarkets(30), createConfig());

    expect(folds.length).toBeGreaterThan(1);
    expect(folds[0]).toMatchObject({
      foldIndex: 0,
      metadata: {
        trainingStartIndex: 0,
        trainingEndIndex: 9,
        validationStartIndex: 11,
        validationEndIndex: 13,
        embargoMarketCount: 1,
      },
    });
  });

  it("enforces embargo gaps so train and validation never overlap", () => {
    const folds = generateWalkForwardFolds(createMarkets(25), createConfig());

    for (const fold of folds) {
      const trainingIndices = new Set(
        fold.trainingMarkets.map((market) => market.orderedIndex),
      );
      for (const market of fold.validationMarkets) {
        expect(trainingIndices.has(market.orderedIndex)).toBe(false);
        expect(market.orderedIndex).toBeGreaterThan(fold.metadata.trainingEndIndex);
      }
    }
  });

  it("rejects duplicate markets", () => {
    const markets = [
      createMarket(0),
      createMarket(0, { fixturePath: "other/fixture.json" }),
    ];

    expect(() => generateWalkForwardFolds(markets, createConfig())).toThrow(
      WalkForwardSplitError,
    );

    try {
      generateWalkForwardFolds(markets, createConfig());
    } catch (error) {
      expect((error as WalkForwardSplitError).code).toBe(
        WalkForwardSplitErrorCode.DUPLICATE_MARKET,
      );
    }
  });

  it("rejects missing market close times", () => {
    expect(() =>
      generateWalkForwardFolds(
        [createMarket(0, { marketCloseTime: "" })],
        createConfig(),
      ),
    ).toThrow(WalkForwardSplitError);
  });

  it("rejects invalid window sizes and embargo values", () => {
    const markets = createMarkets(20);

    expect(() =>
      generateWalkForwardFolds(markets, createConfig({ trainingWindowSize: 0 })),
    ).toThrow(WalkForwardSplitError);
    expect(() =>
      generateWalkForwardFolds(markets, createConfig({ embargoMarketCount: -1 })),
    ).toThrow(WalkForwardSplitError);
  });

  it("rejects configs where the first fold cannot fit", () => {
    expect(() =>
      generateWalkForwardFolds(createMarkets(10), createConfig()),
    ).toThrow(WalkForwardSplitError);
  });

  it("produces a single fold when step size exceeds the remaining dataset", () => {
    const folds = generateWalkForwardFolds(
      createMarkets(14),
      createConfig({ stepSize: 100 }),
    );

    expect(folds).toHaveLength(1);
    expect(folds[0]?.foldIndex).toBe(0);
  });

  it("rejects overlapping validation windows when disabled", () => {
    expect(() =>
      generateWalkForwardFolds(
        createMarkets(30),
        createConfig({
          validationWindowSize: 5,
          stepSize: 2,
          allowOverlappingValidationWindows: false,
        }),
      ),
    ).toThrow(WalkForwardSplitError);
  });

  it("serializes folds deterministically", () => {
    const markets = createMarkets(20);
    const config = createConfig({ stepSize: 5 });
    const first = serializeWalkForwardFold(generateWalkForwardFolds(markets, config)[0]!);
    const second = serializeWalkForwardFold(generateWalkForwardFolds(markets, config)[0]!);

    expect(first).toBe(second);
  });
});
