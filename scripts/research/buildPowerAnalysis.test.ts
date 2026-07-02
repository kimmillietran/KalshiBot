import { describe, expect, it } from "vitest";

import { runPowerAnalysisCommand } from "./buildPowerAnalysis";
import {
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
  PowerAnalysisCommandError,
} from "./buildPowerAnalysisTypes";

describe("buildPowerAnalysis CLI args", () => {
  it("defaults input and output paths", () => {
    expect(parseInputDirFromArgv([])).toBe("data/research-results");
    expect(parseOutputPathFromArgv([])).toBe(
      "data/research-results/power-analysis.json",
    );
  });

  it("throws when flags are missing values", () => {
    expect(() => parseInputDirFromArgv(["--input-dir"])).toThrow(
      PowerAnalysisCommandError,
    );
    expect(() => parseOutputPathFromArgv(["--output"])).toThrow(
      PowerAnalysisCommandError,
    );
  });
});

describe("runPowerAnalysisCommand", () => {
  it("writes power-analysis.json for an empty dataset", () => {
    const outputPath = "data/research-results/power-analysis.json";
    const files: Record<string, string> = {};
    const stdout: string[] = [];

    const exitCode = runPowerAnalysisCommand(
      ["--output", outputPath],
      {
        readdir: () => [],
        readFile: (path) => files[path]!,
        fileExists: () => false,
        isDirectory: () => true,
        writeStdout: (text) => {
          stdout.push(text);
        },
        writeStderr: () => undefined,
        writeFile: (path, data) => {
          files[path] = data;
        },
        mkdirSync: () => undefined,
      },
      { generatedAt: "2026-06-28T12:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(files[outputPath]).toContain('"strategyCount":0');
    expect(stdout[0]).toContain(outputPath);
  });
});
