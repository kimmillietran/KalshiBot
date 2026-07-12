import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";

import { createFilesystemJsonlIo, createMemoryJsonlIo } from "@/lib/data/research/jsonl";

import type { CalibrationFadeForwardValidationIo } from "./calibrationFadeForwardValidationTypes";

export function createCalibrationFadeForwardValidationIo(): CalibrationFadeForwardValidationIo {
  const jsonl = createFilesystemJsonlIo();
  return {
    ...jsonl,
    writeFile: (path, data) => {
      writeFileSync(path, data, "utf8");
    },
    appendFile: (path, data) => {
      writeFileSync(path, data, { encoding: "utf8", flag: "a" });
    },
    mkdirSync: (path, options) => {
      mkdirSync(path, options);
    },
    unlinkFile: (path) => {
      unlinkSync(path);
    },
    renameFile: (from, to) => {
      renameSync(from, to);
    },
    isDirectory: (path) => statSync(path).isDirectory(),
    readdir: (path) => readdirSync(path),
    fileExists: (path) => existsSync(path),
  };
}

export function createMemoryCalibrationFadeForwardValidationIo(
  files: Record<string, string>,
  dirs: readonly string[] = [],
): CalibrationFadeForwardValidationIo {
  const normalizedDirs = new Set(dirs.map((entry) => entry.replace(/\\/g, "/")));
  const jsonl = createMemoryJsonlIo(files);
  const writes: Record<string, string> = {};

  return {
    ...jsonl,
    readFile: (path) => writes[path.replace(/\\/g, "/")] ?? jsonl.readFile(path),
    fileExists: (path) => {
      const normalized = path.replace(/\\/g, "/");
      return normalized in writes || jsonl.fileExists(path) || normalizedDirs.has(normalized);
    },
    isDirectory: (path) => normalizedDirs.has(path.replace(/\\/g, "/")),
    readdir: (path) => {
      const prefix = `${path.replace(/\\/g, "/")}/`;
      const names = new Set<string>();
      for (const key of [...Object.keys(files), ...Object.keys(writes)]) {
        if (key.startsWith(prefix)) {
          const segment = key.slice(prefix.length).split("/")[0];
          if (segment) {
            names.add(segment);
          }
        }
      }
      return [...names];
    },
    writeFile: (path, data) => {
      writes[path.replace(/\\/g, "/")] = data;
    },
    appendFile: (path, data) => {
      const normalized = path.replace(/\\/g, "/");
      writes[normalized] = `${writes[normalized] ?? jsonl.readFile(path)}${data}`;
    },
    mkdirSync: () => undefined,
    unlinkFile: (path) => {
      delete writes[path.replace(/\\/g, "/")];
    },
    renameFile: (from, to) => {
      const normalizedFrom = from.replace(/\\/g, "/");
      const normalizedTo = to.replace(/\\/g, "/");
      writes[normalizedTo] = writes[normalizedFrom] ?? jsonl.readFile(from);
      delete writes[normalizedFrom];
    },
  };
}
