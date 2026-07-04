import { describe, expect, it } from "vitest";

import { runGenerateExpansionImportConfigCommand } from "./generateExpansionImportConfig";

const GENERATED_AT = "2026-07-03T12:00:00.000Z";
const PLAN_PATH = "data/research-results/historical-coverage-plan.json";

function createPlanJson(): string {
  return JSON.stringify({
    generatedAt: GENERATED_AT,
    outputPath: PLAN_PATH,
    recommendations: [
      {
        priority: 1,
        windowStart: "2026-03-01T00:00:00.000Z",
        windowEnd: "2026-03-31T23:59:59.000Z",
        estimatedMarketCount: 7200,
        reason: "March expansion",
      },
    ],
  });
}

describe("runGenerateExpansionImportConfigCommand", () => {
  it("dry-runs by default without writing output files", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runGenerateExpansionImportConfigCommand([], {
      readFile: (path) => (path === PLAN_PATH ? createPlanJson() : ""),
      fileExists: (path) => path === PLAN_PATH,
      isDirectory: () => false,
      readdir: () => [],
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: () => {},
      writeFile: (path, data) => {
        writes.set(path, data);
      },
      mkdirSync: () => {},
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(0);
    expect(writes.size).toBe(0);
    expect(JSON.parse(stdout).dryRun).toBe(true);
    expect(JSON.parse(stdout).scheduledJobCount).toBe(1);
  });

  it("writes JSON and HTML outputs when --write is passed", () => {
    const writes = new Map<string, string>();
    const outputPath = "data/import-configs/historical-expansion-config.json";
    const htmlOutputPath = "data/reports/historical-expansion-config.html";

    const exitCode = runGenerateExpansionImportConfigCommand(
      ["--write", "--output", outputPath, "--html-output", htmlOutputPath],
      {
        readFile: (path) => (path === PLAN_PATH ? createPlanJson() : ""),
        fileExists: (path) => path === PLAN_PATH,
        isDirectory: () => false,
        readdir: () => [],
        writeStdout: () => {},
        writeStderr: () => {},
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: () => {},
      },
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    expect(writes.has(outputPath)).toBe(true);
    expect(writes.has(htmlOutputPath)).toBe(true);
    expect(writes.get(htmlOutputPath)).toContain("Historical Expansion Import Config");
  });

  it("returns non-zero when the coverage plan is missing", () => {
    let stderr = "";

    const exitCode = runGenerateExpansionImportConfigCommand([], {
      readFile: () => "",
      fileExists: () => false,
      isDirectory: () => false,
      readdir: () => [],
      writeStdout: () => {},
      writeStderr: (text) => {
        stderr += text;
      },
      writeFile: () => {},
      mkdirSync: () => {},
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Missing historical coverage plan");
  });
});
