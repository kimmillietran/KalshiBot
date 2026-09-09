import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";

import { readJsonlStream } from "@/lib/data/research/jsonl";

import type { ForwardSettlementCoverageIo } from "./forwardSettlementCoverageTypes";

/** Production filesystem IO with bounded-memory JSONL streaming for large captures. */
export function createFilesystemForwardSettlementCoverageIo(): ForwardSettlementCoverageIo {
  return {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
    readdir: (path) => readdirSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
    iterateJsonl: (path, options) => readJsonlStream(path, options),
    writeFile: (path, data) => {
      writeFileSync(path, data, "utf8");
    },
    mkdirSync: (path, options) => {
      mkdirSync(path, options);
    },
  };
}
