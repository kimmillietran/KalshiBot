import { describe, expect, it } from "vitest";

import { BatchFixtureBridgeRunnerErrorCode } from "./batchFixtureBridgeTypes";
import { discoverBatchFixtureImportPaths } from "./discoverBatchFixtureImports";

describe("discoverBatchFixtureImportPaths", () => {
  it("throws when the input directory does not exist", () => {
    expect(() =>
      discoverBatchFixtureImportPaths("data/imports-does-not-exist-xyz"),
    ).toThrowError(
      expect.objectContaining({
        code: BatchFixtureBridgeRunnerErrorCode.MISSING_INPUT_DIR,
      }),
    );
  });
});
