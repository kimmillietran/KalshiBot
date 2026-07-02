import { describe, expect, it } from "vitest";

import { runDataHealthReportCommand } from "./buildDataHealthReport";

const GENERATED_AT = "2026-07-02T22:45:00.000Z";
const OUTPUT_PATH = "data/research-results/data-health.json";

describe("runDataHealthReportCommand", () => {
  it("writes data-health.json for an empty project", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runDataHealthReportCommand(
      ["--output", OUTPUT_PATH],
      {
        readdir: () => [],
        readFile: () => "",
        fileExists: () => false,
        isDirectory: () => false,
        getLastModified: () => null,
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
    expect(parsed.pipelineCoverage.researchOutputs).toBe(0);
    expect(JSON.parse(stdout).outputPath).toBe(OUTPUT_PATH);
  });
});
