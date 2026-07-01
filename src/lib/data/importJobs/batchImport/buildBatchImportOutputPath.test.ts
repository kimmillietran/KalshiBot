import { describe, expect, it } from "vitest";

import { buildBatchImportOutputPath } from "./buildBatchImportOutputPath";
import { BatchImportRunnerErrorCode } from "./batchImportTypes";

describe("buildBatchImportOutputPath", () => {
  it("maps series/market config paths to import-result.json outputs", () => {
    expect(
      buildBatchImportOutputPath(
        "data/import-configs",
        "data/imports",
        "data/import-configs/KXBTC15M/KXBTC15M-MARKET-A/config.json",
      ),
    ).toEqual({
      seriesTicker: "KXBTC15M",
      marketTicker: "KXBTC15M-MARKET-A",
      outputPath: "data/imports/KXBTC15M/KXBTC15M-MARKET-A/import-result.json",
    });
  });

  it("rejects config paths outside the input directory", () => {
    expect(() =>
      buildBatchImportOutputPath(
        "data/import-configs",
        "data/imports",
        "other/config.json",
      ),
    ).toThrowError(
      expect.objectContaining({
        code: BatchImportRunnerErrorCode.INVALID_CONFIG_PATH,
      }),
    );
  });

  it("rejects config paths that do not match the expected layout", () => {
    expect(() =>
      buildBatchImportOutputPath(
        "data/import-configs",
        "data/imports",
        "data/import-configs/config.json",
      ),
    ).toThrowError(
      expect.objectContaining({
        code: BatchImportRunnerErrorCode.INVALID_CONFIG_PATH,
      }),
    );
  });
});
