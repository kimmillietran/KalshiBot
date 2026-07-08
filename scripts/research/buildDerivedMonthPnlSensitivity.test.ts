import { describe, expect, it } from "vitest";

import { runDerivedMonthPnlSensitivityCommand } from "./buildDerivedMonthPnlSensitivity";

describe("runDerivedMonthPnlSensitivityCommand", () => {
  it("returns non-zero when required inputs are missing", () => {
    const stderr: string[] = [];
    const exitCode = runDerivedMonthPnlSensitivityCommand(
      ["--output", "out.json", "--html-output", "out.html"],
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
      { generatedAt: "2026-01-01T00:00:00.000Z" },
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("Missing required input");
  });
});
