import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createMemoryJsonlIo } from "./createJsonlIo";
import { iterateJsonlLines, readJsonlStream } from "./readJsonlStream";

describe("readJsonlStream", () => {
  it("reads records line-by-line from a file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jsonl-stream-"));
    const path = join(dir, "sample.jsonl");
    writeFileSync(path, '{"id":1}\n\n{"id":2}\n', "utf8");

    const records: number[] = [];
    const summary = await readJsonlStream(path, {
      onLine: (line) => {
        records.push((JSON.parse(line) as { id: number }).id);
        return "continue";
      },
    });

    expect(records).toEqual([1, 2]);
    expect(summary.linesRead).toBe(3);
    expect(summary.blankLinesSkipped).toBe(1);
    expect(summary.recordsHandled).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips malformed lines and counts them", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jsonl-stream-"));
    const path = join(dir, "malformed.jsonl");
    writeFileSync(path, '{"ok":true}\n{bad\n{"also":true}\n', "utf8");

    const summary = await readJsonlStream(path, {
      onLine: (line) => {
        try {
          JSON.parse(line);
          return "continue";
        } catch {
          return "skip";
        }
      },
    });

    expect(summary.recordsHandled).toBe(2);
    expect(summary.invalidLineCount).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("respects maxRecords", async () => {
    const summary = iterateJsonlLines(
      ['{"id":1}', '{"id":2}', '{"id":3}'],
      {
        maxRecords: 2,
        onLine: () => "continue",
      },
    );

    expect(summary.recordsHandled).toBe(2);
    expect(summary.truncated).toBe(true);
  });

  it("streams in-memory JSONL via createMemoryJsonlIo", async () => {
    const io = createMemoryJsonlIo({
      "fixture.jsonl": '{"value":1}\n{"value":2}\n',
    });
    const values: number[] = [];

    const summary = await io.iterateJsonl("fixture.jsonl", {
      onLine: (line) => {
        values.push((JSON.parse(line) as { value: number }).value);
        return "continue";
      },
    });

    expect(values).toEqual([1, 2]);
    expect(summary.recordsHandled).toBe(2);
  });
});
