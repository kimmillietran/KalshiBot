import { describe, expect, it } from "vitest";

import { BatchImportRunnerErrorCode } from "./batchImportTypes";
import { discoverBatchImportConfigPaths } from "./discoverBatchImportConfigs";

describe("discoverBatchImportConfigPaths", () => {
  it("throws when the input directory does not exist", () => {
    expect(() =>
      discoverBatchImportConfigPaths("data/import-configs-does-not-exist-xyz"),
    ).toThrowError(
      expect.objectContaining({
        code: BatchImportRunnerErrorCode.MISSING_INPUT_DIR,
      }),
    );
  });
});
