import { describe, expect, it } from "vitest";

import { runRebuildAfterExpansionCommand } from "./rebuildAfterExpansion";

const GENERATED_AT = "2026-07-04T12:00:00.000Z";
const SUMMARY_PATH = "data/research-results/historical-expansion-import-summary.json";

function createSummaryJson(): string {
  return JSON.stringify({
    generatedAt: GENERATED_AT,
    execute: true,
    inputPath: "data/import-configs/historical-expansion-config.json",
    outputPath: SUMMARY_PATH,
    jobs: [],
  });
}

describe("runRebuildAfterExpansionCommand", () => {
  it("returns non-zero when expansion import summary has no imported markets", async () => {
    let stderr = "";

    const exitCode = await runRebuildAfterExpansionCommand([], {
      readFile: (path) => (path === SUMMARY_PATH ? createSummaryJson() : ""),
      fileExists: (path) => path === SUMMARY_PATH,
      isDirectory: () => false,
      readdir: () => [],
      writeStdout: () => {},
      writeStderr: (text) => {
        stderr += text;
      },
      writeFile: () => {},
      mkdirSync: () => {},
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("No imported markets found");
  });

  it("returns non-zero when expansion import summary is missing", async () => {
    let stderr = "";

    const exitCode = await runRebuildAfterExpansionCommand([], {
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
    expect(stderr).toContain("Missing expansion import summary");
  });
});
