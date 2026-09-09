import { describe, expect, it } from "vitest";

import { runCalibrationFadeV2CrossRunValidationCommand } from "./buildCalibrationFadeV2CrossRunValidation";

describe("runCalibrationFadeV2CrossRunValidationCommand", () => {
  it("fails closed on latest-run selection and omitted evidence mode", async () => {
    const stderr: string[] = [];
    const io = {
      writeStdout: () => undefined,
      writeStderr: (text: string) => {
        stderr.push(text);
      },
      writeFile: () => undefined,
      mkdirSync: () => undefined,
      fileExists: () => false,
      readFile: () => "",
      unlinkFile: () => undefined,
      renameFile: () => undefined,
    };

    expect(
      await runCalibrationFadeV2CrossRunValidationCommand(
        ["--latest", "--evidence-mode", "confirmatory"],
        io,
      ),
    ).toBe(1);
    expect(stderr.join("")).toMatch(/Unknown CLI flag|--latest/);

    stderr.length = 0;
    expect(
      await runCalibrationFadeV2CrossRunValidationCommand(
        ["--capture-run-dir", "run-a", "--capture-run-dir", "run-b"],
        io,
      ),
    ).toBe(1);
    expect(stderr.join("")).toMatch(/--evidence-mode is required/);
  });
});
