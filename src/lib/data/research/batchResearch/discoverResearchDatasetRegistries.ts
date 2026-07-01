import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  DATASET_REGISTRY_FILENAME,
  BatchResearchRunnerError,
  BatchResearchRunnerErrorCode,
  type BatchResearchFilesystem,
} from "./batchResearchTypes";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function walkRegistryPaths(directory: string): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      const registryPath = join(fullPath, DATASET_REGISTRY_FILENAME);
      if (existsSync(registryPath)) {
        results.push(normalizePath(registryPath));
      }
      continue;
    }

    if (entry === DATASET_REGISTRY_FILENAME) {
      results.push(normalizePath(fullPath));
    }
  }

  return results;
}

/** Discovers dataset-registry.json files and returns them in deterministic order. */
export function discoverResearchDatasetRegistryPaths(registryDir: string): readonly string[] {
  if (!existsSync(registryDir)) {
    throw new BatchResearchRunnerError(
      `Registry directory does not exist: ${registryDir}`,
      BatchResearchRunnerErrorCode.MISSING_REGISTRY_DIR,
    );
  }

  const registryPaths = [...walkRegistryPaths(registryDir)].sort((left, right) =>
    left.localeCompare(right),
  );

  if (registryPaths.length === 0) {
    throw new BatchResearchRunnerError(
      `No ${DATASET_REGISTRY_FILENAME} files found under: ${registryDir}`,
      BatchResearchRunnerErrorCode.MISSING_REGISTRY,
    );
  }

  return registryPaths;
}

/** Production filesystem adapter for batch research runs. */
export function createNodeBatchResearchFilesystem(): BatchResearchFilesystem {
  return {
    exists: (path) => existsSync(path),
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    writeFile: (path, data) => writeFileSync(path, data, "utf8"),
    mkdir: (path) => {
      mkdirSync(path, { recursive: true });
    },
    listRegistryPaths: discoverResearchDatasetRegistryPaths,
  };
}
