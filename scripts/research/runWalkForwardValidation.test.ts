import { describe, expect, it } from "vitest";

import {
  createNodeWalkForwardSplitFilesystem,
  runWalkForwardSplit,
} from "@/lib/data/research/walkForwardEngine";

import { runWalkForwardValidationCommand } from "./runWalkForwardValidation";
import {
  parseEmbargoFromArgv,
  parseOutputDirFromArgv,
  parseRegistryDirFromArgv,
  parseSplitIdFromArgv,
  parseStepSizeFromArgv,
  parseTrainingWindowFromArgv,
  parseValidationWindowFromArgv,
  WalkForwardCommandError,
} from "./walkForwardCommandTypes";

function createRegistryJson(marketCount: number): string {
  const markets = Array.from({ length: marketCount }, (_, index) => ({
    seriesTicker: "KXBTC15M",
    marketTicker: `KXBTC15M-WF-${String(index).padStart(3, "0")}`,
    fixturePath: `data/fixtures/KXBTC15M/KXBTC15M-WF-${String(index).padStart(3, "0")}/fixture.json`,
    marketCloseTime: `2026-06-26T23:${String(index).padStart(2, "0")}:00.000Z`,
    validationStatus: { valid: true },
  }));

  return JSON.stringify({
    seriesTicker: "KXBTC15M",
    markets,
  });
}

describe("walk-forward argv parsing", () => {
  it("defaults registry and output directories", () => {
    expect(parseRegistryDirFromArgv([])).toBe("data/research-datasets");
    expect(parseOutputDirFromArgv([])).toBe("data/walk-forward");
  });

  it("parses CLI flags", () => {
    expect(parseSplitIdFromArgv(["--split-id", "wf-test"])).toBe("wf-test");
    expect(parseTrainingWindowFromArgv(["--training-window", "5"])).toBe(5);
    expect(parseValidationWindowFromArgv(["--validation-window", "2"])).toBe(2);
    expect(parseStepSizeFromArgv(["--step-size", "3"])).toBe(3);
    expect(parseEmbargoFromArgv(["--embargo", "1"])).toBe(1);
  });

  it("rejects invalid numeric flags", () => {
    expect(() => parseTrainingWindowFromArgv(["--training-window", "0"])).toThrow(
      WalkForwardCommandError,
    );
    expect(() => parseEmbargoFromArgv(["--embargo", "-1"])).toThrow(
      WalkForwardCommandError,
    );
  });
});

describe("runWalkForwardValidationCommand", () => {
  it("runs via dependency injection and writes stdout summary", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const registryPath = "data/research-datasets/KXBTC15M/dataset-registry.json";
    const files = new Map<string, string>([
      [registryPath, createRegistryJson(12)],
    ]);
    const writes = new Map<string, string>();

    const filesystem = {
      exists: (path: string) =>
        path === "data/research-datasets" || files.has(path) || writes.has(path),
      readFile: (path: string) => {
        const written = writes.get(path);
        if (written !== undefined) {
          return written;
        }
        const value = files.get(path);
        if (value === undefined) {
          throw new Error(`missing file: ${path}`);
        }
        return value;
      },
      writeFile: (path: string, data: string) => {
        writes.set(path, data);
      },
      mkdir: () => undefined,
      listRegistryPaths: () => [registryPath],
    };

    const exitCode = runWalkForwardValidationCommand(
      [
        "--registry",
        "data/research-datasets",
        "--output-dir",
        "data/walk-forward",
        "--split-id",
        "wf-cli-test",
        "--training-window",
        "4",
        "--validation-window",
        "2",
        "--step-size",
        "2",
        "--embargo",
        "1",
      ],
      {
        readFile: (path) => {
          const value = files.get(path);
          if (value === undefined) {
            throw new Error(`missing file: ${path}`);
          }
          return value;
        },
        writeStdout: (text) => {
          stdout.push(text);
        },
        writeStderr: (text) => {
          stderr.push(text);
        },
      },
      { generatedAt: "2026-06-27T12:00:00.000Z", filesystem },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout[0]).toContain('"splitId":"wf-cli-test"');
    expect(stdout[0]).toContain('"foldCount"');
  });

  it("requires split config when --config is omitted", () => {
    const exitCode = runWalkForwardValidationCommand([], {
      readFile: () => "",
      writeStdout: () => undefined,
      writeStderr: () => undefined,
    });

    expect(exitCode).toBe(1);
  });
});

describe("createNodeWalkForwardSplitFilesystem", () => {
  it("exports a production filesystem adapter", () => {
    expect(typeof createNodeWalkForwardSplitFilesystem().readFile).toBe("function");
    expect(typeof runWalkForwardSplit).toBe("function");
  });
});
