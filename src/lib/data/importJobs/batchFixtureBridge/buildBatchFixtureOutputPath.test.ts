import { describe, expect, it } from "vitest";

import { buildBatchFixtureOutputPath } from "./buildBatchFixtureOutputPath";
import { BatchFixtureBridgeRunnerErrorCode } from "./batchFixtureBridgeTypes";

describe("buildBatchFixtureOutputPath", () => {
  it("maps series/market import paths to fixture.json outputs", () => {
    expect(
      buildBatchFixtureOutputPath(
        "data/imports",
        "data/fixtures",
        "data/imports/KXBTC15M/KXBTC15M-MARKET-A/import-result.json",
      ),
    ).toEqual({
      seriesTicker: "KXBTC15M",
      marketTicker: "KXBTC15M-MARKET-A",
      fixturePath: "data/fixtures/KXBTC15M/KXBTC15M-MARKET-A/fixture.json",
    });
  });

  it("rejects import paths outside the input directory", () => {
    expect(() =>
      buildBatchFixtureOutputPath(
        "data/imports",
        "data/fixtures",
        "other/import-result.json",
      ),
    ).toThrowError(
      expect.objectContaining({
        code: BatchFixtureBridgeRunnerErrorCode.INVALID_IMPORT_PATH,
      }),
    );
  });
});
