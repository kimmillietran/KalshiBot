import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  BATCH_FIXTURE_IMPORT_RESULT_FILENAME,
  BatchFixtureBridgeRunnerError,
  BatchFixtureBridgeRunnerErrorCode,
  type BatchFixtureBridgeFilesystem,
} from "./batchFixtureBridgeTypes";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function walkImportPaths(directory: string): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      results.push(...walkImportPaths(fullPath));
      continue;
    }

    if (entry === BATCH_FIXTURE_IMPORT_RESULT_FILENAME) {
      results.push(normalizePath(fullPath));
    }
  }

  return results;
}

/** Recursively discovers import-result.json files and returns them in deterministic order. */
export function discoverBatchFixtureImportPaths(inputDir: string): readonly string[] {
  if (!existsSync(inputDir)) {
    throw new BatchFixtureBridgeRunnerError(
      `Input directory does not exist: ${inputDir}`,
      BatchFixtureBridgeRunnerErrorCode.MISSING_INPUT_DIR,
    );
  }

  return [...walkImportPaths(inputDir)].sort((left, right) => left.localeCompare(right));
}

/** Production filesystem adapter for batch fixture bridge runs. */
export function createNodeBatchFixtureBridgeFilesystem(): BatchFixtureBridgeFilesystem {
  return {
    exists: (path) => existsSync(path),
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    writeFile: (path, data) => writeFileSync(path, data, "utf8"),
    mkdir: (path) => {
      mkdirSync(path, { recursive: true });
    },
    listImportPaths: discoverBatchFixtureImportPaths,
  };
}
