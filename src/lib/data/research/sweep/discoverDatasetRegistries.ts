import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { SERIES_REGISTRY_FILENAME } from "@/lib/data/research/registry/researchDatasetRegistryPaths";

import {
  StrategySweepError,
  StrategySweepErrorCode,
  type StrategySweepFilesystem,
} from "./strategySweepTypes";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function walkRegistryPaths(directory: string): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      const registryPath = join(fullPath, SERIES_REGISTRY_FILENAME);
      if (existsSync(registryPath)) {
        results.push(normalizePath(registryPath));
      }
      continue;
    }

    if (entry === SERIES_REGISTRY_FILENAME) {
      results.push(normalizePath(fullPath));
    }
  }

  return results;
}

/** Discovers dataset-registry.json files and returns them in deterministic order. */
export function discoverStrategySweepRegistryPaths(
  registryDir: string,
): readonly string[] {
  if (!existsSync(registryDir)) {
    throw new StrategySweepError(
      `Registry directory does not exist: ${registryDir}`,
      StrategySweepErrorCode.MISSING_REGISTRY_DIR,
    );
  }

  const registryPaths = [...walkRegistryPaths(registryDir)].sort((left, right) =>
    left.localeCompare(right),
  );

  if (registryPaths.length === 0) {
    throw new StrategySweepError(
      `No ${SERIES_REGISTRY_FILENAME} files found under: ${registryDir}`,
      StrategySweepErrorCode.MISSING_REGISTRY,
    );
  }

  return registryPaths;
}

/** Production filesystem adapter for strategy sweep runs. */
export function createNodeStrategySweepFilesystem(): StrategySweepFilesystem {
  return {
    exists: (path) => existsSync(path),
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    writeFile: (path, data) => writeFileSync(path, data, "utf8"),
    mkdir: (path) => {
      mkdirSync(path, { recursive: true });
    },
    listRegistryPaths: discoverStrategySweepRegistryPaths,
  };
}
