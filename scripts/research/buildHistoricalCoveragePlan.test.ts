import { describe, expect, it } from "vitest";

import { runHistoricalCoveragePlanCommand } from "./buildHistoricalCoveragePlan";

const GENERATED_AT = "2026-07-03T20:00:00.000Z";
const OUTPUT_PATH = "data/research-results/historical-coverage-plan.json";
const HTML_PATH = "data/reports/historical-coverage-plan.html";

describe("runHistoricalCoveragePlanCommand", () => {
  it("writes JSON and HTML coverage plan outputs", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runHistoricalCoveragePlanCommand([], {
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: () => {},
      writeFile: (path, data) => {
        writes.set(path, data);
      },
      mkdirSync: () => {},
      readdir: () => [],
      readFile: () => "{}",
      fileExists: () => false,
      isDirectory: () => false,
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(0);
    expect(writes.has(OUTPUT_PATH)).toBe(true);
    expect(writes.has(HTML_PATH)).toBe(true);

    const parsed = JSON.parse(writes.get(OUTPUT_PATH)!);
    expect(parsed.generatedAt).toBe(GENERATED_AT);
    expect(parsed.snapshot.marketCount).toBe(0);
    expect(writes.get(HTML_PATH)).toContain("Historical Coverage Expansion Plan");
    expect(JSON.parse(stdout.trim()).outputPath).toBe(OUTPUT_PATH);
  });
});
