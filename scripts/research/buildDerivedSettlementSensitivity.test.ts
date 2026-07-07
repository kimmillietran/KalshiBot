import { describe, expect, it, vi } from "vitest";

import { runDerivedSettlementSensitivityCommand } from "./buildDerivedSettlementSensitivity";

describe("runDerivedSettlementSensitivityCommand", () => {
  it("writes derived sensitivity artifacts with missing inputs", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runDerivedSettlementSensitivityCommand(
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
        readdir: () => [],
        isDirectory: () => false,
      },
      { generatedAt: "2026-07-07T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(writes.has("data/research-results/derived-settlement-sensitivity.json")).toBe(true);
    expect(writes.has("data/reports/derived-settlement-sensitivity.html")).toBe(true);
    expect(stdout).toContain('"totalHypotheses":0');
    expect(writes.get("data/reports/derived-settlement-sensitivity.html")).toContain(
      "Derived Settlement Sensitivity Audit",
    );
  });
});
