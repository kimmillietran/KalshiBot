import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { discoverResearchDatasetRegistryPaths } from "@/lib/data/research/batchResearch";

import type { WalkForwardSplitFilesystem } from "./walkForwardSplitTypes";

/** Production filesystem adapter for walk-forward split runs. */
export function createNodeWalkForwardSplitFilesystem(): WalkForwardSplitFilesystem {
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
