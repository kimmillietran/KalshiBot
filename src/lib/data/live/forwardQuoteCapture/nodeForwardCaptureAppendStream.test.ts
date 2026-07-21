import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createNodeForwardCaptureAppendStream } from "./nodeForwardCaptureAppendStream";

describe("createNodeForwardCaptureAppendStream", () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("appends chunks in order and flushes them on end()", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "capture-stream-"));
    const path = join(tempDir, "records.jsonl");

    const stream = createNodeForwardCaptureAppendStream(path);
    stream.write('{"seq":1}\n');
    stream.write('{"seq":2}\n');
    await stream.end();

    // Reopening in append mode must preserve earlier records.
    const reopened = createNodeForwardCaptureAppendStream(path);
    reopened.write('{"seq":3}\n');
    await reopened.end();

    const lines = readFileSync(path, "utf8").trimEnd().split("\n");
    expect(lines.map((line) => (JSON.parse(line) as { seq: number }).seq)).toEqual([1, 2, 3]);
  });
});
