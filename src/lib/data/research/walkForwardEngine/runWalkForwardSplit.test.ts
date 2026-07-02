import { describe, expect, it } from "vitest";

import { runWalkForwardSplit } from "./runWalkForwardSplit";
import { serializeWalkForwardSplitSummary } from "./serializeWalkForwardSplit";
import type {
  WalkForwardSplitDefinition,
  WalkForwardSplitFilesystem,
} from "./walkForwardSplitTypes";

function createRegistryJson(
  markets: Array<{
    marketTicker: string;
    marketCloseTime: string;
    fixturePath: string;
  }>,
): string {
  return JSON.stringify({
    seriesTicker: "KXBTC15M",
    markets: markets.map((market) => ({
      seriesTicker: "KXBTC15M",
      marketTicker: market.marketTicker,
      fixturePath: market.fixturePath,
      marketCloseTime: market.marketCloseTime,
      validationStatus: { valid: true },
    })),
  });
}

function createFilesystem(
  registries: Record<string, string>,
): WalkForwardSplitFilesystem {
  const files = new Map<string, string>(Object.entries(registries));
  const writes = new Map<string, string>();

  return {
    exists: (path) =>
      path === "data/research-datasets" || files.has(path) || writes.has(path),
    readFile: (path) => {
      const written = writes.get(path);
      if (written !== undefined) {
        return written;
      }

      const value = files.get(path);
      if (value === undefined) {
        throw new Error(`missing file: ${path}`);
      }
      return value;
    },
    writeFile: (path, data) => {
      writes.set(path, data);
    },
    mkdir: () => undefined,
    listRegistryPaths: () =>
      [...Object.keys(registries)].sort((left, right) => left.localeCompare(right)),
  };
}

function createConfig(
  overrides: Partial<WalkForwardSplitDefinition> = {},
): WalkForwardSplitDefinition {
  return {
    splitId: "wf-cli",
    trainingWindowSize: 4,
    validationWindowSize: 2,
    stepSize: 2,
    embargoMarketCount: 1,
    allowOverlappingValidationWindows: true,
    ...overrides,
  };
}

describe("runWalkForwardSplit", () => {
  it("writes fold artifacts and a summary under data/walk-forward", () => {
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const markets = Array.from({ length: 12 }, (_, index) => ({
      marketTicker: `KXBTC15M-WF-${String(index).padStart(3, "0")}`,
      marketCloseTime: `2026-06-26T23:${String(index).padStart(2, "0")}:00.000Z`,
      fixturePath: `data/fixtures/KXBTC15M/KXBTC15M-WF-${String(index).padStart(3, "0")}/fixture.json`,
    }));
    const filesystem = createFilesystem({
      [registryPath]: createRegistryJson(markets),
    });

    const summary = runWalkForwardSplit(
      {
        registryDir: "data/research-datasets",
        outputDir: "data/walk-forward",
        config: createConfig(),
        generatedAt: "2026-06-27T12:00:00.000Z",
      },
      { filesystem },
    );

    expect(summary.foldCount).toBeGreaterThan(0);
    expect(summary.summaryPath).toBe(
      "data/walk-forward/wf-cli/walk-forward-summary.json",
    );
    expect(summary.folds[0]?.outputPath).toBe(
      "data/walk-forward/wf-cli/folds/fold-000.json",
    );

    const foldJson = filesystem.readFile(summary.folds[0]!.outputPath);
    const parsedFold = JSON.parse(foldJson) as {
      trainingMarkets: unknown[];
      validationMarkets: unknown[];
    };

    expect(parsedFold.trainingMarkets).toHaveLength(4);
    expect(parsedFold.validationMarkets).toHaveLength(2);

    const summaryJson = filesystem.readFile(summary.summaryPath);
    expect(serializeWalkForwardSplitSummary(summary)).toBe(summaryJson);
  });
});
