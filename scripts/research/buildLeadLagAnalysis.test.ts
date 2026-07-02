import { describe, expect, it } from "vitest";

import { runLeadLagAnalysisCommand } from "./buildLeadLagAnalysis";
import {
  LeadLagCommandError,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
} from "./buildLeadLagAnalysisTypes";

describe("buildLeadLagAnalysis CLI args", () => {
  it("defaults input and output paths", () => {
    expect(parseInputDirFromArgv([])).toBe("data/research-results");
    expect(parseOutputPathFromArgv([])).toBe(
      "data/research-results/lead-lag-analysis.json",
    );
  });

  it("parses explicit paths", () => {
    expect(parseInputDirFromArgv(["--input-dir", "custom/results"])).toBe(
      "custom/results",
    );
    expect(parseOutputPathFromArgv(["--output", "custom/lead-lag.json"])).toBe(
      "custom/lead-lag.json",
    );
  });

  it("throws when flags are missing values", () => {
    expect(() => parseInputDirFromArgv(["--input-dir"])).toThrow(
      LeadLagCommandError,
    );
    expect(() => parseOutputPathFromArgv(["--output"])).toThrow(
      LeadLagCommandError,
    );
  });
});

describe("runLeadLagAnalysisCommand", () => {
  it("writes lead-lag-analysis.json and returns exit code 0 for an empty dataset", () => {
    const inputRoot = "data/research-results";
    const outputPath = "data/research-results/lead-lag-analysis.json";
    const files: Record<string, string> = {};
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = runLeadLagAnalysisCommand(
      ["--input-dir", inputRoot, "--output", outputPath],
      {
        readdir: () => [],
        readFile: (path) => files[path]!,
        fileExists: () => false,
        isDirectory: () => true,
        writeStdout: (text) => {
          stdout.push(text);
        },
        writeStderr: (text) => {
          stderr.push(text);
        },
        writeFile: (path, data) => {
          files[path] = data;
        },
        mkdirSync: () => undefined,
      },
      { generatedAt: "2026-06-27T20:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toHaveLength(0);
    expect(files[outputPath]).toContain('"empty-dataset"');
    expect(stdout[0]).toContain(outputPath);
  });
});
