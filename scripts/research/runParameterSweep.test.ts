import { describe, expect, it, vi } from "vitest";

import { runParameterSweepCommand } from "./runParameterSweep";
import { parseConfigPathFromArgv } from "./parameterSweepCommandTypes";
import { normalizeParameterSweepArgv } from "../lib/cliArgvSchemas";

describe("runParameterSweepCommand", () => {
  it("requires --config", async () => {
    const writeStderr = vi.fn();

    const exitCode = await runParameterSweepCommand([], {
      readFile: () => "",
      writeStdout: vi.fn(),
      writeStderr,
    });

    expect(exitCode).toBe(1);
    expect(writeStderr).toHaveBeenCalledWith(
      expect.stringContaining("Missing required --config"),
    );
  });
});

describe("parameter sweep argv normalization", () => {
  it("maps npm-stripped positional config and output-dir", () => {
    const normalized = normalizeParameterSweepArgv([
      "sweep.json",
      "data/research-datasets",
      "data/research-results",
    ]);

    expect(parseConfigPathFromArgv(normalized)).toBe("sweep.json");
  });
});
