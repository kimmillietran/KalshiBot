import { describe, expect, it, vi } from "vitest";

import { StrategyPluginRegistry } from "@/lib/data/strategies/plugin/StrategyPluginRegistry";

import { runStrategySweepCommand } from "./runStrategySweep";
import {
  resolveStrategySelectionFromArgv,
  StrategySweepCommandError,
} from "./strategySweepTypes";

describe("resolveStrategySelectionFromArgv", () => {
  it("requires --all or --strategy", () => {
    expect(() =>
      resolveStrategySelectionFromArgv([], () => ["noop"]),
    ).toThrow(StrategySweepCommandError);
  });

  it("rejects duplicate --strategy values", () => {
    expect(() =>
      resolveStrategySelectionFromArgv(
        ["--strategy", "noop", "--strategy", "noop"],
        () => ["noop"],
      ),
    ).toThrow(/Duplicate strategy id/);
  });

  it("returns all registered strategies for --all", () => {
    expect(
      resolveStrategySelectionFromArgv(["--all"], () => [
        "noop",
        "buy-first-ask",
      ]),
    ).toEqual(["noop", "buy-first-ask"]);
  });
});

describe("runStrategySweepCommand", () => {
  it("accepts npm-stripped positional strategy id", async () => {
    const exitCode = await runStrategySweepCommand(
      ["noop"],
      {
        writeStdout: vi.fn(),
        writeStderr: vi.fn(),
      },
      {
        deps: {
          filesystem: {
            exists: () => false,
            readFile: () => "",
            writeFile: vi.fn(),
            mkdir: vi.fn(),
            listRegistryPaths: () => {
              throw new Error("Registry directory does not exist");
            },
          },
          strategyRegistry: StrategyPluginRegistry.createBuiltIn(),
          parseFixtureJson: (json) => JSON.parse(json),
          runResearch: () => "{}",
        },
      },
    );

    expect(exitCode).toBe(1);
  });

  it("returns exit code 1 when any run fails", async () => {
    const exitCode = await runStrategySweepCommand(
      ["--strategy", "noop", "--registry", "missing-registry"],
      {
        writeStdout: vi.fn(),
        writeStderr: vi.fn(),
      },
      {
        deps: {
          filesystem: {
            exists: () => false,
            readFile: () => "",
            writeFile: vi.fn(),
            mkdir: vi.fn(),
            listRegistryPaths: () => {
              throw new Error("Registry directory does not exist");
            },
          },
          strategyRegistry: StrategyPluginRegistry.createBuiltIn(),
          parseFixtureJson: (json) => JSON.parse(json),
          runResearch: () => "{}",
        },
      },
    );

    expect(exitCode).toBe(1);
  });
});
