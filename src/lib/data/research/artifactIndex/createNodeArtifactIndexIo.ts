import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { ArtifactIndexIo } from "./researchArtifactIndexTypes";

function walkFiles(root: string, fileName: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const matches: string[] = [];
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
        matches.push(entryPath);
      }
    }
  }

  return matches.sort((left, right) => left.localeCompare(right));
}

/** Creates a filesystem-backed IO adapter for artifact index scanning. */
export function createNodeArtifactIndexIo(): ArtifactIndexIo {
  return {
    readdir: (path) => {
      try {
        return readdirSync(path);
      } catch {
        return [];
      }
    },
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
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
    getFileSizeBytes: (path) => {
      try {
        return statSync(path).size;
      } catch {
        return null;
      }
    },
    countFilesNamedUnder: (root, fileName) => walkFiles(root, fileName).length,
    sumFileSizesNamedUnder: (root, fileName) =>
      walkFiles(root, fileName).reduce((total, filePath) => {
        try {
          return total + statSync(filePath).size;
        } catch {
          return total;
        }
      }, 0),
    maxModifiedTimeMsNamedUnder: (root, fileName) => {
      const mtimes = walkFiles(root, fileName).map((filePath) => {
        try {
          return statSync(filePath).mtimeMs;
        } catch {
          return null;
        }
      }).filter((value): value is number => value !== null);

      return mtimes.length > 0 ? Math.max(...mtimes) : null;
    },
  };
}
