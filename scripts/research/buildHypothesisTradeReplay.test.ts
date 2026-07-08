import { describe, expect, it } from "vitest";

import { runHypothesisTradeReplayCommand } from "./buildHypothesisTradeReplay";

describe("runHypothesisTradeReplayCommand", () => {
  it("fails when hypothesis candidates input is missing", () => {
    const stderr: string[] = [];
    const exitCode = runHypothesisTradeReplayCommand(
      ["--input", "missing/hypothesis-candidates.json"],
      {
        readFile: () => "",
        writeStdout: () => {},
        writeStderr: (text) => {
          stderr.push(text);
        },
        writeFile: () => {},
        mkdirSync: () => {},
        readdir: () => [],
        fileExists: () => false,
        isDirectory: () => false,
      },
      { generatedAt: "2026-07-08T12:00:00.000Z" },
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("Missing hypothesis candidates input");
  });
});
