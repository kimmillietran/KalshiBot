import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import type { WalkForwardSweepFilesystem } from "./walkForwardSweepTypes";

/** Production filesystem adapter for walk-forward strategy sweep runs. */
export function createNodeWalkForwardSweepFilesystem(): WalkForwardSweepFilesystem {
  return {
    exists: (path) => existsSync(path),
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    writeFile: (path, data) => writeFileSync(path, data, "utf8"),
    mkdir: (path) => {
      mkdirSync(path, { recursive: true });
    },
  };
}
