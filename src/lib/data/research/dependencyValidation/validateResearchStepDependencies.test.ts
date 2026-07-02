import { describe, expect, it } from "vitest";

import { buildResearchStepDependencySpecs } from "./buildResearchStepDependencySpecs";
import {
  formatDependencyFailureMessage,
  validateResearchStepDependencies,
} from "./validateResearchStepDependencies";
import type { ResearchDependencyIo } from "./researchDependencyTypes";

function createIo(
  overrides: Partial<ResearchDependencyIo> = {},
): ResearchDependencyIo {
  return {
    fileExists: () => false,
    isDirectory: () => false,
    getModifiedTimeMs: () => null,
    countFilesNamedUnder: () => 0,
    ...overrides,
  };
}

describe("validateResearchStepDependencies", () => {
  const specs = buildResearchStepDependencySpecs({
    discoveryOutputPath: "discovery-result.json",
  });

  it("fails when a required dependency is missing", () => {
    const result = validateResearchStepDependencies({
      spec: specs.get("hypotheses")!,
      io: createIo(),
      strictDependencies: false,
    });

    expect(result.dependencyStatus).toBe("failed");
    expect(result.missingDependencies.length).toBeGreaterThan(0);
    expect(result.missingDependencies.some((entry) => entry.includes("Mispricing atlas"))).toBe(
      true,
    );
  });

  it("warns when optional dependencies are missing", () => {
    const result = validateResearchStepDependencies({
      spec: specs.get("hypotheses")!,
      io: createIo({
        fileExists: (path) =>
          path.endsWith("mispricing-atlas.json")
          || path.endsWith("lead-lag-analysis.json")
          || path.endsWith("statistical-significance.json"),
      }),
      strictDependencies: false,
    });

    expect(result.dependencyStatus).toBe("warning");
    expect(result.warnings.some((entry) => entry.includes("Regime tags"))).toBe(true);
    expect(result.warnings.some((entry) => entry.includes("Strategy leaderboard"))).toBe(true);
  });

  it("warns when an existing output artifact is stale", () => {
    const result = validateResearchStepDependencies({
      spec: specs.get("hypotheses")!,
      io: createIo({
        fileExists: () => true,
        getModifiedTimeMs: (path) => {
          if (path.endsWith("hypothesis-candidates.json")) {
            return 100;
          }
          return 200;
        },
      }),
      strictDependencies: false,
    });

    expect(result.dependencyStatus).toBe("warning");
    expect(result.staleDependencies.length).toBeGreaterThan(0);
    expect(result.warnings.some((entry) => entry.includes("Stale artifact detected"))).toBe(
      true,
    );
  });

  it("fails on stale artifacts in strict mode", () => {
    const result = validateResearchStepDependencies({
      spec: specs.get("hypotheses")!,
      io: createIo({
        fileExists: () => true,
        getModifiedTimeMs: (path) => {
          if (path.endsWith("hypothesis-candidates.json")) {
            return 100;
          }
          return 200;
        },
      }),
      strictDependencies: true,
    });

    expect(result.dependencyStatus).toBe("failed");
    expect(result.staleDependencies.length).toBeGreaterThan(0);
  });

  it("passes when required dependencies are present and fresh", () => {
    const result = validateResearchStepDependencies({
      spec: specs.get("hypotheses")!,
      io: createIo({
        fileExists: (path) =>
          path.endsWith("mispricing-atlas.json")
          || path.endsWith("lead-lag-analysis.json")
          || path.endsWith("statistical-significance.json"),
        getModifiedTimeMs: () => 200,
      }),
      strictDependencies: false,
    });

    expect(result.dependencyStatus).toBe("warning");
    expect(result.missingDependencies).toEqual([]);
    expect(result.staleDependencies).toEqual([]);
  });

  it("formats dependency failure messages with missing and stale details", () => {
    const message = formatDependencyFailureMessage("Generate hypothesis candidates", {
      dependencyStatus: "failed",
      missingDependencies: ["Missing Mispricing atlas (data/research-results/mispricing-atlas.json)"],
      staleDependencies: ["data/research-results/hypothesis-candidates.json is older than data/research-results/mispricing-atlas.json"],
      warnings: [],
    });

    expect(message).toContain("Generate hypothesis candidates");
    expect(message).toContain("Missing:");
    expect(message).toContain("Stale:");
  });
});

describe("buildResearchStepDependencySpecs", () => {
  it("defines report dependencies with optional calibration coverage", () => {
    const spec = buildResearchStepDependencySpecs({
      discoveryOutputPath: "discovery-result.json",
    }).get("report");

    expect(spec?.requiredArtifacts.some((artifact) => artifact.id === "strategy-leaderboard")).toBe(
      true,
    );
    expect(spec?.optionalArtifacts.some((artifact) => artifact.id === "calibration-reports")).toBe(
      true,
    );
  });
});
