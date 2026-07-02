import { describe, expect, it } from "vitest";

import {
  runAnalyzeBatchImportFailuresCommand,
} from "./analyzeBatchImportFailures";
import {
  AnalyzeBatchImportFailuresCommandError,
  parseInputPathFromArgv,
  parseOutputPathFromArgv,
} from "./analyzeBatchImportFailuresTypes";

describe("analyzeBatchImportFailures CLI args", () => {
  it("defaults input and output paths", () => {
    expect(parseInputPathFromArgv([])).toBe("data/imports/batch-import-summary.json");
    expect(parseOutputPathFromArgv([])).toBe("data/imports/import-failure-analysis.json");
  });

  it("parses explicit paths", () => {
    expect(parseInputPathFromArgv(["--input", "custom/summary.json"])).toBe(
      "custom/summary.json",
    );
    expect(parseOutputPathFromArgv(["--output", "custom/analysis.json"])).toBe(
      "custom/analysis.json",
    );
  });

  it("throws when flags are missing values", () => {
    expect(() => parseInputPathFromArgv(["--input"])).toThrow(
      AnalyzeBatchImportFailuresCommandError,
    );
    expect(() => parseOutputPathFromArgv(["--output"])).toThrow(
      AnalyzeBatchImportFailuresCommandError,
    );
  });
});

describe("runAnalyzeBatchImportFailuresCommand", () => {
  it("writes import-failure-analysis.json and returns exit code 0", () => {
    const inputPath = "data/imports/batch-import-summary.json";
    const outputPath = "data/imports/import-failure-analysis.json";
    const files: Record<string, string> = {
      [inputPath]: JSON.stringify({
        inputDir: "data/import-configs",
        outputDir: "data/imports",
        concurrency: 2,
        startedAt: "2026-06-27T12:00:00.000Z",
        completedAt: "2026-06-27T12:05:00.000Z",
        durationMs: 300_000,
        totalConfigs: 2,
        successfulImports: 1,
        failedImports: 1,
        skippedImports: 0,
        summaryPath: inputPath,
        markets: [
          {
            marketTicker: "KXBTC15M-OK",
            configPath: "data/import-configs/KXBTC15M-OK/config.json",
            outputPath: "data/imports/KXBTC15M/KXBTC15M-OK/import-result.json",
            status: "success",
            errorMessage: null,
            jobId: "import-ok",
            bronzeRecordCount: 4,
            valid: true,
          },
          {
            marketTicker: "KXBTC15M-FAIL",
            configPath: "data/import-configs/KXBTC15M-FAIL/config.json",
            outputPath: "data/imports/KXBTC15M/KXBTC15M-FAIL/import-result.json",
            status: "failed",
            errorMessage: "HTTP 429 rate limit exceeded",
            jobId: "import-fail",
            bronzeRecordCount: null,
            valid: null,
          },
        ],
      }),
    };
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = runAnalyzeBatchImportFailuresCommand(
      ["--input", inputPath, "--output", outputPath],
      {
        readFile: (path) => files[path]!,
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
        fileExists: (path) => files[path] !== undefined,
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toHaveLength(0);
    expect(stdout[0]).toContain(outputPath);
    expect(files[outputPath]).toContain('"code":"rate-limited"');
    expect(files[outputPath]).toContain('"recoverableFailures":1');
  });

  it("returns exit code 1 when the summary file is missing", () => {
    const stderr: string[] = [];

    const exitCode = runAnalyzeBatchImportFailuresCommand([], {
      readFile: () => "",
      writeStdout: () => undefined,
      writeStderr: (text) => {
        stderr.push(text);
      },
      writeFile: () => undefined,
      mkdirSync: () => undefined,
      fileExists: () => false,
    });

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("Missing batch import summary");
  });
});
