import { describe, expect, it } from "vitest";

import { runVolPremiumStudyCommand } from "./buildVolPremiumStudy";
import {
  VolPremiumCommandError,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
} from "./buildVolPremiumStudyTypes";

describe("buildVolPremiumStudy CLI args", () => {
  it("defaults input and output paths", () => {
    expect(parseInputDirFromArgv([])).toBe("data/research-results");
    expect(parseOutputPathFromArgv([])).toBe(
      "data/research-results/vol-premium-study.json",
    );
  });

  it("parses explicit paths", () => {
    expect(parseInputDirFromArgv(["--input-dir", "custom/results"])).toBe(
      "custom/results",
    );
    expect(parseOutputPathFromArgv(["--output", "custom/vol-premium.json"])).toBe(
      "custom/vol-premium.json",
    );
  });

  it("throws when flags are missing values", () => {
    expect(() => parseInputDirFromArgv(["--input-dir"])).toThrow(
      VolPremiumCommandError,
    );
    expect(() => parseOutputPathFromArgv(["--output"])).toThrow(
      VolPremiumCommandError,
    );
  });
});

describe("runVolPremiumStudyCommand", () => {
  it("writes vol-premium-study.json and returns exit code 0 for an empty dataset", () => {
    const inputRoot = "data/research-results";
    const outputPath = "data/research-results/vol-premium-study.json";
    const files: Record<string, string> = {};
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = runVolPremiumStudyCommand(
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
      { generatedAt: "2026-06-28T12:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toHaveLength(0);
    expect(files[outputPath]).toContain('"empty-dataset"');
    expect(stdout[0]).toContain(outputPath);
  });
});
