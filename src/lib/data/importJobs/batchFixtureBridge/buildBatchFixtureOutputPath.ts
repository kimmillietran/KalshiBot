import { posix } from "node:path";

import {
  BATCH_FIXTURE_IMPORT_RESULT_FILENAME,
  BATCH_FIXTURE_OUTPUT_FILENAME,
  BatchFixtureBridgeRunnerError,
  BatchFixtureBridgeRunnerErrorCode,
} from "./batchFixtureBridgeTypes";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

/** Validates and maps an import-result path to its fixture output location. */
export function buildBatchFixtureOutputPath(
  inputDir: string,
  outputDir: string,
  importPath: string,
): { seriesTicker: string; marketTicker: string; fixturePath: string } {
  const normalizedInputDir = normalizePath(inputDir);
  const normalizedOutputDir = normalizePath(outputDir);
  const normalizedImportPath = normalizePath(importPath);

  const relativePath = posix.relative(normalizedInputDir, normalizedImportPath);
  if (
    relativePath.startsWith("..")
    || posix.isAbsolute(relativePath)
    || relativePath.length === 0
  ) {
    throw new BatchFixtureBridgeRunnerError(
      `Import path is outside input directory: ${importPath}`,
      BatchFixtureBridgeRunnerErrorCode.INVALID_IMPORT_PATH,
      { importPath },
    );
  }

  const segments = relativePath.split("/");
  if (
    segments.length !== 3
    || segments[0]?.trim() === ""
    || segments[1]?.trim() === ""
    || segments[2] !== BATCH_FIXTURE_IMPORT_RESULT_FILENAME
  ) {
    throw new BatchFixtureBridgeRunnerError(
      `Import path must match <series>/<marketTicker>/${BATCH_FIXTURE_IMPORT_RESULT_FILENAME}`,
      BatchFixtureBridgeRunnerErrorCode.INVALID_IMPORT_PATH,
      { importPath },
    );
  }

  const [seriesTicker, marketTicker] = segments;
  const fixturePath = posix.join(
    normalizedOutputDir,
    seriesTicker,
    marketTicker,
    BATCH_FIXTURE_OUTPUT_FILENAME,
  );

  return {
    seriesTicker,
    marketTicker,
    fixturePath,
  };
}
