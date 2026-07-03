import { describe, expect, it } from "vitest";

import { runHypothesisLifecycleDashboardCommand } from "./buildHypothesisLifecycleDashboard";

describe("buildHypothesisLifecycleDashboard CLI", () => {
  it("writes the lifecycle HTML dashboard", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runHypothesisLifecycleDashboardCommand([], {
      readFile: () => "",
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: () => {},
      writeFile: (path, data) => {
        writes.set(path, data);
      },
      mkdirSync: () => {},
      fileExists: () => false,
      getLastModified: () => null,
      readdir: () => [],
      isDirectory: () => false,
    }, { generatedAt: "2026-07-03T20:00:00.000Z" });

    expect(exitCode).toBe(0);
    expect(writes.has("data/reports/research-hypothesis-lifecycle.html")).toBe(true);
    expect(writes.get("data/reports/research-hypothesis-lifecycle.html")).toContain(
      "Hypothesis Lifecycle Dashboard",
    );
    expect(stdout).toContain('"totalHypotheses":0');
  });
});
