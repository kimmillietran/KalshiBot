import { describe, expect, it, vi } from "vitest";

import { runCrossValidationCommand } from "./buildCrossValidation";

describe("runCrossValidationCommand", () => {
  it("writes cross-validation artifacts with empty upstream inputs", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runCrossValidationCommand(
      [],
      {
        readFile: () => "",
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: vi.fn(),
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: vi.fn(),
        readdir: () => [],
        fileExists: () => false,
        isDirectory: () => false,
      },
      { generatedAt: "2026-07-03T12:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(writes.has("data/research-results/cross-validation.json")).toBe(true);
    expect(writes.has("data/reports/research-cross-validation.html")).toBe(true);
    expect(stdout).toContain('"totalTargets":0');
    expect(writes.get("data/reports/research-cross-validation.html")).toContain(
      "Research Cross-Validation",
    );
  });
});
