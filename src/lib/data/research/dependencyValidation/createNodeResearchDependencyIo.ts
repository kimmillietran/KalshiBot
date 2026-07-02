import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { ResearchDependencyIo } from "./researchDependencyTypes";

function countEntriesUnder(root: string, fileName: string): number {
  if (!existsSync(root)) {
    return 0;
  }

  let count = 0;
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current || !existsSync(current)) {
      continue;
    }

    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = join(current, entry);
      let stat;
      try {
        stat = statSync(entryPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (fileName === "" || entry === fileName) {
        count += 1;
      }
    }
  }

  return count;
}

/** Creates a filesystem-backed dependency IO adapter for CLI usage. */
export function createNodeResearchDependencyIo(): ResearchDependencyIo {
  return {
    fileExists: (path) => existsSync(path),
    isDirectory: (path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    getModifiedTimeMs: (path) => {
      try {
        return statSync(path).mtimeMs;
      } catch {
        return null;
      }
    },
    countFilesNamedUnder: (root, fileName) => countEntriesUnder(root, fileName),
  };
}
