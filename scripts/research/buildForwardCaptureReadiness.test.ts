import { describe, expect, it } from "vitest";

import { runForwardCaptureReadinessCommand } from "./buildForwardCaptureReadiness";

const GENERATED_AT = "2026-07-09T12:00:00.000Z";
const OUTPUT_PATH = "data/research-results/forward-capture-readiness.json";
const HTML_PATH = "data/reports/forward-capture-readiness.html";

describe("runForwardCaptureReadinessCommand", () => {
  it("writes readiness json and html outputs for empty capture inventory", () => {
    const files: Record<string, string> = {};
    let stdout = "";

    const exitCode = runForwardCaptureReadinessCommand(
      ["--output", OUTPUT_PATH, "--html-output", HTML_PATH],
      {
        readFile: (path) => files[path] ?? "",
        fileExists: (path) => path in files,
        readdir: () => [],
        isDirectory: () => false,
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
    expect(files[HTML_PATH]).toContain("Forward Capture Research Readiness");
    const payload = JSON.parse(stdout);
    expect(payload.overallVerdict).toBe("not-ready-no-data");
    expect(payload.recommendedNextAction).toBe("keep-capturing");
  });
});
