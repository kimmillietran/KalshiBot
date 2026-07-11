import { createReadStream } from "node:fs";
import { readFileSync, statSync } from "node:fs";
import { createInterface } from "node:readline";

import type { JsonlStreamOptions, JsonlStreamSummary } from "./readJsonlStream";
import { iterateJsonlLines, readJsonlStream } from "./readJsonlStream";

export type JsonlIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  fileSizeBytes?: (path: string) => number | null;
  streamJsonl: (path: string, options: JsonlStreamOptions) => Promise<JsonlStreamSummary>;
  iterateJsonl: (path: string, options: JsonlStreamOptions) => Promise<JsonlStreamSummary>;
};

const LARGE_JSONL_BYTES = 32 * 1024 * 1024;

export function createFilesystemJsonlIo(): JsonlIo {
  return {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => {
      try {
        statSync(path);
        return true;
      } catch {
        return false;
      }
    },
    fileSizeBytes: (path) => {
      try {
        return statSync(path).size;
      } catch {
        return null;
      }
    },
    streamJsonl: (path, options) => readJsonlStream(path, options),
    iterateJsonl: (path, options) => readJsonlStream(path, options),
  };
}

export function shouldStreamJsonl(path: string, io: Pick<JsonlIo, "fileSizeBytes">): boolean {
  const size = io.fileSizeBytes?.(path);
  return size !== null && size !== undefined && size >= LARGE_JSONL_BYTES;
}

export function createMemoryJsonlIo(files: Record<string, string>): JsonlIo {
  const normalized = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path.replaceAll("\\", "/"), content]),
  );

  return {
    readFile: (path) => normalized[path.replaceAll("\\", "/")] ?? "",
    fileExists: (path) => path.replaceAll("\\", "/") in normalized,
    fileSizeBytes: (path) => {
      const content = normalized[path.replaceAll("\\", "/")];
      return content ? Buffer.byteLength(content, "utf8") : null;
    },
    streamJsonl: async (path, options) =>
      iterateJsonlLines((normalized[path.replaceAll("\\", "/")] ?? "").split(/\r?\n/), options),
    iterateJsonl: async (path, options) =>
      iterateJsonlLines((normalized[path.replaceAll("\\", "/")] ?? "").split(/\r?\n/), options),
  };
}

export async function collectJsonlRecords<T>(input: {
  path: string;
  io: JsonlIo;
  parseLine: (line: string, lineNumber: number) => T | null;
  maxRecords?: number;
}): Promise<{ records: T[]; summary: JsonlStreamSummary }> {
  const records: T[] = [];
  const summary = await input.io.iterateJsonl(input.path, {
    ...(input.maxRecords !== undefined ? { maxRecords: input.maxRecords } : {}),
    onLine: (line, lineNumber) => {
      try {
        const record = input.parseLine(line, lineNumber);
        if (record === null) {
          return "skip";
        }
        records.push(record);
        return "continue";
      } catch {
        return "skip";
      }
    },
  });

  return { records, summary };
}

export async function countJsonlLines(input: {
  path: string;
  io: JsonlIo;
  maxRecords?: number;
  validateJson?: boolean;
}): Promise<JsonlStreamSummary> {
  return input.io.iterateJsonl(input.path, {
    ...(input.maxRecords !== undefined ? { maxRecords: input.maxRecords } : {}),
    onLine: (line) => {
      if (input.validateJson) {
        try {
          JSON.parse(line);
        } catch {
          return "skip";
        }
      }
      return "continue";
    },
  });
}

export function streamJsonlLinesFromString(
  content: string,
  options: JsonlStreamOptions,
): JsonlStreamSummary {
  return iterateJsonlLines(content.split(/\r?\n/), options);
}

export function createLineIterableFromFile(path: string): AsyncIterable<string> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lineReader = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  return {
    async *[Symbol.asyncIterator]() {
      try {
        for await (const line of lineReader) {
          yield line;
        }
      } finally {
        lineReader.close();
        stream.destroy();
      }
    },
  };
}
