import { describe, expect, it } from "vitest";

import { runResearchCandidateRegistryCommand } from "./buildResearchCandidateRegistry";

describe("buildResearchCandidateRegistry CLI", () => {
  it("writes registry JSON and HTML", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runResearchCandidateRegistryCommand([], {
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
    }, { generatedAt: "2026-07-03T22:00:00.000Z" });

    expect(exitCode).toBe(0);
    expect(writes.has("data/research-results/research-candidate-registry.json")).toBe(true);
    expect(writes.has("data/reports/research-candidate-registry.html")).toBe(true);
    expect(stdout).toContain('"totalCandidates":0');
  });
});
