import { describe, expect, it } from "vitest";

import { runRegimeTaggingCommand } from "./buildRegimeTags";

const GENERATED_AT = "2026-06-27T22:30:00.000Z";
const INPUT_ROOT = "data/research-results";
const OUTPUT_PATH = `${INPUT_ROOT}/regime-tags.json`;

describe("runRegimeTaggingCommand", () => {
  it("writes regime-tags.json for an empty input directory", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runRegimeTaggingCommand(
      ["--output", OUTPUT_PATH],
      {
        readdir: () => [],
        readFile: () => {
          throw new Error("should not read");
        },
        fileExists: () => false,
        isDirectory: (path) => path === INPUT_ROOT,
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: () => {},
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: () => {},
      },
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    const serialized = writes.get(OUTPUT_PATH);
    expect(serialized).toBeDefined();
    const parsed = JSON.parse(serialized!);
    expect(parsed.generatedAt).toBe(GENERATED_AT);
    expect(parsed.markets).toEqual([]);
    expect(parsed.warnings[0]?.code).toBe("empty-dataset");
    expect(JSON.parse(stdout).outputPath).toBe(OUTPUT_PATH);
  });
});
