import { describe, expect, it } from "vitest";

import { runCalibrationFadeFamilyVerdictCommand } from "./buildCalibrationFadeFamilyVerdict";

const GENERATED_AT = "2026-07-08T04:00:00.000Z";
const OUTPUT_PATH = "data/research-results/calibration-fade-family-verdict.json";
const HTML_PATH = "data/reports/calibration-fade-family-verdict.html";

describe("runCalibrationFadeFamilyVerdictCommand", () => {
  it("writes family verdict json and html outputs", () => {
    const files: Record<string, string> = {};
    let stdout = "";

    const exitCode = runCalibrationFadeFamilyVerdictCommand(
      ["--output", OUTPUT_PATH, "--html-output", HTML_PATH],
      {
        readFile: (path) => files[path] ?? "",
        fileExists: (path) => path in files,
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: () => undefined,
        writeFile: (path, data) => {
          files[path] = data;
        },
        mkdirSync: () => undefined,
      },
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    expect(files[OUTPUT_PATH]).toBeDefined();
    expect(files[HTML_PATH]).toContain("Calibration-Fade Family Verdict");
    const payload = JSON.parse(stdout);
    expect(payload.familyVerdict).toBe("blocked-by-missing-artifacts");
  });
});
