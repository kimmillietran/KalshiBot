import { statSync } from "node:fs";

import { createFilesystemJsonlIo, iterateJsonlLines } from "@/lib/data/research/jsonl";

import type { ParityNearMissAnalysisIo } from "./parityNearMissAnalysisTypes";

export function createParityNearMissAnalysisIo(): ParityNearMissAnalysisIo {
  const jsonl = createFilesystemJsonlIo();
  return {
    ...jsonl,
    isDirectory: (path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    },
  };
}

export function createMemoryParityNearMissIo(
  files: Record<string, string>,
  directories: readonly string[] = [],
): ParityNearMissAnalysisIo {
  const normalized = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path.replaceAll("\\", "/"), content]),
  );
  const dirSet = new Set(directories.map((path) => path.replaceAll("\\", "/")));

  for (const path of Object.keys(normalized)) {
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      dirSet.add(parts.slice(0, index).join("/"));
    }
  }

  const iterateJsonl: ParityNearMissAnalysisIo["iterateJsonl"] = async (path, options) =>
    iterateJsonlLines((normalized[path.replaceAll("\\", "/")] ?? "").split(/\r?\n/), options);

  return {
    readFile: (path: string) => normalized[path.replaceAll("\\", "/")] ?? "",
    fileExists: (path: string) =>
      path.replaceAll("\\", "/") in normalized || dirSet.has(path.replaceAll("\\", "/")),
    fileSizeBytes: (path: string) => {
      const content = normalized[path.replaceAll("\\", "/")];
      return content ? Buffer.byteLength(content, "utf8") : null;
    },
    streamJsonl: iterateJsonl,
    iterateJsonl,
    isDirectory: (path) => dirSet.has(path.replaceAll("\\", "/")),
  };
}
