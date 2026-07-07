import { describe, expect, it } from "vitest";

import { runResearchPipelineDashboardCommand } from "./buildResearchPipelineDashboard";

describe("buildResearchPipelineDashboard CLI", () => {
  it("writes research-dashboard.html", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runResearchPipelineDashboardCommand([], {
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
    }, { generatedAt: "2026-07-03T21:00:00.000Z" });

    expect(exitCode).toBe(0);
    expect(writes.has("data/reports/research-dashboard.html")).toBe(true);
    expect(writes.get("data/reports/research-dashboard.html")).toContain(
      "Research Pipeline Dashboard",
    );
    expect(writes.get("data/reports/research-dashboard.html")).toContain(
      "Research Diagnostics",
    );
    expect(stdout).toContain('"pipelineStatus":"unknown"');
  });
});
