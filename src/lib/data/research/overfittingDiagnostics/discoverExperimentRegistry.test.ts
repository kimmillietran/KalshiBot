import { describe, expect, it } from "vitest";

import { discoverExperimentRegistry } from "./discoverExperimentRegistry";

const EXPERIMENTS_ROOT = "data/experiments";

describe("discoverExperimentRegistry", () => {
  it("returns unavailable diagnostics when the registry directory is missing", () => {
    const result = discoverExperimentRegistry(EXPERIMENTS_ROOT, {
      readdir: () => [],
      readFile: () => {
        throw new Error("should not read");
      },
      fileExists: () => false,
      isDirectory: () => false,
    });

    expect(result.available).toBe(false);
    expect(result.experimentCount).toBe(0);
    expect(result.uniqueConfigCount).toBe(0);
    expect(result.warnings[0]).toContain("Experiment registry not found");
  });

  it("returns zero counts when the registry directory exists but is empty", () => {
    const result = discoverExperimentRegistry(EXPERIMENTS_ROOT, {
      readdir: () => [],
      readFile: () => {
        throw new Error("should not read");
      },
      fileExists: (path) => path === EXPERIMENTS_ROOT,
      isDirectory: (path) => path === EXPERIMENTS_ROOT,
    });

    expect(result.available).toBe(true);
    expect(result.experimentCount).toBe(0);
    expect(result.warnings.some((warning) => warning.includes("no experiment records"))).toBe(
      true,
    );
  });
});
