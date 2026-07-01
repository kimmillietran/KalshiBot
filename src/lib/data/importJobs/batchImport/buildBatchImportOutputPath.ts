import { posix } from "node:path";

import {
  BATCH_IMPORT_CONFIG_FILENAME,
  BATCH_IMPORT_RESULT_FILENAME,
  BatchImportRunnerError,
  BatchImportRunnerErrorCode,
} from "./batchImportTypes";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

/** Validates and maps a config path to its batch import output location. */
export function buildBatchImportOutputPath(
  inputDir: string,
  outputDir: string,
  configPath: string,
): { seriesTicker: string; marketTicker: string; outputPath: string } {
  const normalizedInputDir = normalizePath(inputDir);
  const normalizedOutputDir = normalizePath(outputDir);
  const normalizedConfigPath = normalizePath(configPath);

  const relativePath = posix.relative(normalizedInputDir, normalizedConfigPath);
  if (
    relativePath.startsWith("..")
    || posix.isAbsolute(relativePath)
    || relativePath.length === 0
  ) {
    throw new BatchImportRunnerError(
      `Config path is outside input directory: ${configPath}`,
      BatchImportRunnerErrorCode.INVALID_CONFIG_PATH,
      { configPath },
    );
  }

  const segments = relativePath.split("/");
  if (
    segments.length !== 3
    || segments[0]?.trim() === ""
    || segments[1]?.trim() === ""
    || segments[2] !== BATCH_IMPORT_CONFIG_FILENAME
  ) {
    throw new BatchImportRunnerError(
      `Config path must match <series>/<marketTicker>/${BATCH_IMPORT_CONFIG_FILENAME}`,
      BatchImportRunnerErrorCode.INVALID_CONFIG_PATH,
      { configPath },
    );
  }

  const [seriesTicker, marketTicker] = segments;
  const outputPath = posix.join(
    normalizedOutputDir,
    seriesTicker,
    marketTicker,
    BATCH_IMPORT_RESULT_FILENAME,
  );

  return {
    seriesTicker,
    marketTicker,
    outputPath,
  };
}
