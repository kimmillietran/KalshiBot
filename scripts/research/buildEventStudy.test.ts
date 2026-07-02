import { describe, expect, it } from "vitest";

import { runEventStudyCommand } from "./buildEventStudy";

const GENERATED_AT = "2026-06-27T23:30:00.000Z";
const INPUT_ROOT = "data/research-results";
const OUTPUT_PATH = `${INPUT_ROOT}/event-study.json`;
const EVENTS_PATH = "data/events/events.json";

describe("runEventStudyCommand", () => {
  it("writes event-study.json for empty events and empty research input", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runEventStudyCommand(
      ["--events", EVENTS_PATH, "--output", OUTPUT_PATH],
      {
        readdir: () => [],
        readFile: (path) => {
          if (path === EVENTS_PATH) {
            return "[]";
          }

          throw new Error(`unexpected read: ${path}`);
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
    expect(parsed.events).toEqual([]);
    expect(parsed.warnings.map((warning: { code: string }) => warning.code)).toContain(
      "empty-events",
    );
    expect(JSON.parse(stdout).outputPath).toBe(OUTPUT_PATH);
  });
});
