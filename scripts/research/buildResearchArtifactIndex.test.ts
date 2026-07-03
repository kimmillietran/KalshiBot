import { describe, expect, it } from "vitest";

import { runResearchArtifactIndexCommand } from "./buildResearchArtifactIndex";

const GENERATED_AT = "2026-07-03T20:00:00.000Z";
const OUTPUT_PATH = "data/research-results/research-artifact-index.json";
const HTML_PATH = "data/reports/research-artifact-index.html";

describe("runResearchArtifactIndexCommand", () => {
  it("writes JSON and HTML artifact index outputs", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runResearchArtifactIndexCommand([], {
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: () => {},
      writeFile: (path, data) => {
        writes.set(path, data);
      },
      mkdirSync: () => {},
      artifactIo: {
        readdir: () => [],
        readFile: () => "{}",
        fileExists: () => false,
        isDirectory: () => false,
        getModifiedTimeMs: () => null,
        getFileSizeBytes: () => null,
        countFilesNamedUnder: () => 0,
        sumFileSizesNamedUnder: () => 0,
        maxModifiedTimeMsNamedUnder: () => null,
      },
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(0);
    expect(writes.has(OUTPUT_PATH)).toBe(true);
    expect(writes.has(HTML_PATH)).toBe(true);

    const parsed = JSON.parse(writes.get(OUTPUT_PATH)!);
    expect(parsed.generatedAt).toBe(GENERATED_AT);
    expect(parsed.summary.totalArtifacts).toBeGreaterThan(0);
    expect(writes.get(HTML_PATH)).toContain("Research Artifact Index");
    expect(JSON.parse(stdout.trim()).outputPath).toBe(OUTPUT_PATH);
  });
});
