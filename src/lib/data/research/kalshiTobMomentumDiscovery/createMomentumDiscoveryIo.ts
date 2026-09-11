import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";

import { createFilesystemJsonlIo } from "../jsonl";

import type { MomentumDiscoveryIo } from "./momentumDiscoveryTypes";

export function createFilesystemMomentumDiscoveryIo(): MomentumDiscoveryIo {
  const jsonl = createFilesystemJsonlIo();
  return {
    readFile: (path) => readFileSync(path, "utf8"),
    writeFile: (path, data) => writeFileSync(path, data, "utf8"),
    appendFile: (path, data) => appendFileSync(path, data, "utf8"),
    fileExists: (path) => existsSync(path),
    isDirectory: (path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    mkdirSync: (path, options) => {
      mkdirSync(path, options);
    },
    unlinkFile: (path) => unlinkSync(path),
    renameFile: (from, to) => renameSync(from, to),
    fileByteLength: (path) => {
      try {
        return statSync(path).size;
      } catch {
        return 0;
      }
    },
    listDirectory: (path) => {
      try {
        return readdirSync(path);
      } catch {
        return [];
      }
    },
    iterateJsonl: async (path, options) => {
      await jsonl.iterateJsonl(path, {
        onLine: (line, lineNumber) => {
          const action = options.onLine(line, { lineNumber });
          return action === "stop" ? "stop" : "continue";
        },
      });
    },
  };
}

export function createMemoryMomentumDiscoveryIo(
  files: Record<string, string>,
  directories: readonly string[] = [],
): MomentumDiscoveryIo {
  const store = new Map(
    Object.entries(files).map(([path, data]) => [path.replaceAll("\\", "/"), data]),
  );
  const dirSet = new Set(directories.map((path) => path.replaceAll("\\", "/").replace(/\/$/, "")));

  const normalize = (path: string) => path.replaceAll("\\", "/");

  return {
    readFile: (path) => {
      const key = normalize(path);
      if (!store.has(key)) {
        throw new Error(`Missing file: ${path}`);
      }
      return store.get(key)!;
    },
    writeFile: (path, data) => {
      store.set(normalize(path), data);
    },
    appendFile: (path, data) => {
      const key = normalize(path);
      store.set(key, `${store.get(key) ?? ""}${data}`);
    },
    fileExists: (path) => {
      const key = normalize(path);
      return store.has(key) || dirSet.has(key.replace(/\/$/, ""));
    },
    isDirectory: (path) => dirSet.has(normalize(path).replace(/\/$/, "")),
    mkdirSync: (path) => {
      dirSet.add(normalize(path).replace(/\/$/, ""));
    },
    fileByteLength: (path) => Buffer.byteLength(store.get(normalize(path)) ?? "", "utf8"),
    listDirectory: (path) => {
      const root = normalize(path).replace(/\/$/, "");
      const children = new Set<string>();
      for (const key of store.keys()) {
        if (!key.startsWith(`${root}/`)) continue;
        const rest = key.slice(root.length + 1);
        const child = rest.split("/")[0];
        if (child) children.add(child);
      }
      for (const dir of dirSet) {
        if (!dir.startsWith(`${root}/`)) continue;
        const rest = dir.slice(root.length + 1);
        const child = rest.split("/")[0];
        if (child) children.add(child);
      }
      return [...children].sort();
    },
    iterateJsonl: async (path, options) => {
      const content = store.get(normalize(path)) ?? "";
      let lineNumber = 0;
      for (const line of content.split(/\r?\n/)) {
        lineNumber += 1;
        const action = options.onLine(line, { lineNumber });
        if (action === "stop") {
          break;
        }
      }
    },
  };
}
