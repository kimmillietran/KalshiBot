import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  BATCH_IMPORT_CONFIG_FILENAME,
  BatchImportRunnerError,
  BatchImportRunnerErrorCode,
  type BatchImportFilesystem,
} from "./batchImportTypes";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function walkConfigPaths(directory: string): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      results.push(...walkConfigPaths(fullPath));
      continue;
    }

    if (entry === BATCH_IMPORT_CONFIG_FILENAME) {
      results.push(normalizePath(fullPath));
    }
  }

  return results;
}

function compareConfigPaths(left: string, right: string): number {
  return left.localeCompare(right);
}

/** Recursively discovers config.json files and returns them in deterministic order. */
export function discoverBatchImportConfigPaths(inputDir: string): readonly string[] {
  if (!existsSync(inputDir)) {
    throw new BatchImportRunnerError(
      `Input directory does not exist: ${inputDir}`,
      BatchImportRunnerErrorCode.MISSING_INPUT_DIR,
    );
  }

  return [...walkConfigPaths(inputDir)].sort(compareConfigPaths);
}

/** Production filesystem adapter for batch historical imports. */
export function createNodeBatchImportFilesystem(): BatchImportFilesystem {
  return {
    exists: (path) => existsSync(path),
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    writeFile: (path, data) => writeFileSync(path, data, "utf8"),
    mkdir: (path) => {
      mkdirSync(path, { recursive: true });
    },
    listConfigPaths: discoverBatchImportConfigPaths,
  };
}
