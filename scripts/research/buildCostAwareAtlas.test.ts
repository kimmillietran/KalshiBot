import { describe, expect, it } from "vitest";

import { runCostAwareAtlasCommand } from "./buildCostAwareAtlas";

describe("runCostAwareAtlasCommand", () => {
  it("writes json and html outputs", () => {
    const writes = new Map<string, string>();
    const stdout: string[] = [];

    const exitCode = runCostAwareAtlasCommand(
      [
        "--input-dir",
        "data/research-results",
        "--output",
        "tmp/cost-aware-atlas.json",
        "--html-output",
        "tmp/cost-aware-atlas.html",
      ],
      {
        readFile: () => {
          throw new Error("missing fixture");
        },
        readdir: () => [],
        fileExists: () => false,
        isDirectory: () => true,
        mkdirSync: () => undefined,
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        writeStdout: (text) => {
          stdout.push(text);
        },
        writeStderr: () => undefined,
      },
      { generatedAt: "2026-01-01T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(writes.has("tmp/cost-aware-atlas.json")).toBe(true);
    expect(writes.has("tmp/cost-aware-atlas.html")).toBe(true);
    expect(stdout.join("")).toContain("totalBuckets");
  });
});
