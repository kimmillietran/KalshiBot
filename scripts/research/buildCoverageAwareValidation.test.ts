import { describe, expect, it, vi } from "vitest";

import { runCoverageAwareValidationCommand } from "./buildCoverageAwareValidation";

describe("runCoverageAwareValidationCommand", () => {
  it("writes coverage-aware validation artifacts with empty upstream inputs", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runCoverageAwareValidationCommand(
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
        fileExists: () => false,
      },
      { generatedAt: "2026-07-04T12:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(writes.has("data/research-results/coverage-aware-validation.json")).toBe(true);
    expect(writes.has("data/reports/coverage-aware-validation.html")).toBe(true);
    expect(stdout).toContain('"totalHypotheses":0');
    expect(writes.get("data/reports/coverage-aware-validation.html")).toContain(
      "Coverage-Aware Validation",
    );
  });
});
