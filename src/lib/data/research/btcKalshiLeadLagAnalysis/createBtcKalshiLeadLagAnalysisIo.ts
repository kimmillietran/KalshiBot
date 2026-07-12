import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, statSync } from "node:fs";

import { createFilesystemJsonlIo, iterateJsonlLines } from "../jsonl";
import type { BtcKalshiLeadLagAnalysisIo } from "./btcKalshiLeadLagAnalysisTypes";

export function createBtcKalshiLeadLagAnalysisIo(): BtcKalshiLeadLagAnalysisIo {
  const jsonl = createFilesystemJsonlIo();

  return {
    ...jsonl,
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
    writeFile: (path, data) => {
      writeFileSync(path, data, "utf8");
    },
    appendFile: (path, data) => {
      appendFileSync(path, data, "utf8");
    },
    mkdirSync: (path, options) => {
      mkdirSync(path, options);
    },
  };
}

export function createMemoryBtcKalshiLeadLagIo(
  files: Record<string, string>,
  directories: readonly string[] = [],
): BtcKalshiLeadLagAnalysisIo {
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

  const iterateJsonl: BtcKalshiLeadLagAnalysisIo["iterateJsonl"] = async (path, options) =>
    iterateJsonlLines((normalized[path.replaceAll("\\", "/")] ?? "").split(/\r?\n/), options);

  return {
    readFile: (path) => normalized[path.replaceAll("\\", "/")] ?? "",
    fileExists: (path) =>
      path.replaceAll("\\", "/") in normalized || dirSet.has(path.replaceAll("\\", "/")),
    isDirectory: (path) => dirSet.has(path.replaceAll("\\", "/")),
    writeFile: (path, data) => {
      normalized[path.replaceAll("\\", "/")] = data;
      files[path] = data;
    },
    appendFile: (path, data) => {
      const key = path.replaceAll("\\", "/");
      normalized[key] = `${normalized[key] ?? ""}${data}`;
      files[path] = normalized[key]!;
    },
    mkdirSync: () => {},
    streamJsonl: iterateJsonl,
    iterateJsonl,
  };
}
