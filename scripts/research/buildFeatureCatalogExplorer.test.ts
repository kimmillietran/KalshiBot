import { describe, expect, it } from "vitest";

import { listUnifiedFeatureCatalogEntries } from "@/lib/data/research/featureCatalog";

import { runFeatureCatalogExplorerCommand } from "./buildFeatureCatalogExplorer";

const GENERATED_AT = "2026-07-07T23:30:00.000Z";
const OUTPUT_PATH = "data/research-results/feature-catalog.json";
const HTML_PATH = "data/reports/feature-catalog.html";

describe("runFeatureCatalogExplorerCommand", () => {
  it("writes feature catalog json and html outputs", () => {
    const files: Record<string, string> = {};
    let stdout = "";

    const exitCode = runFeatureCatalogExplorerCommand(
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
    expect(files[HTML_PATH]).toContain("Feature Catalog Explorer");
    const stdoutPayload = JSON.parse(stdout);
    expect(stdoutPayload.totalFeatures).toBe(listUnifiedFeatureCatalogEntries().length);
    expect(stdoutPayload.missingIndicators).toBeGreaterThan(0);
  });
});
