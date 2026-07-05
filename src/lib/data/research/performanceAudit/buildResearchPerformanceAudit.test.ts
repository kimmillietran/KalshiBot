import { describe, expect, it } from "vitest";

import { buildFullResearchSteps } from "@/lib/data/research/fullOrchestrator/buildFullResearchSteps";
import { createDefaultFullResearchOrchestratorConfig } from "@/lib/data/research/fullOrchestrator/runFullResearchOrchestrator";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildResearchPerformanceAudit } from "./buildResearchPerformanceAudit";
import {
  defaultResearchPerformanceAuditConfig,
} from "./parseResearchPerformanceAuditArgv";
import { serializeResearchPerformanceAuditHtml } from "./serializeResearchPerformanceAuditHtml";

const GENERATED_AT = "2026-07-03T22:00:00.000Z";
const CONFIG = createDefaultFullResearchOrchestratorConfig();

function buildFixtureFiles(): Record<string, string> {
  const steps = buildFullResearchSteps(CONFIG).map((step) => ({
    stepId: step.id,
    label: step.label,
    npmScript: step.npmScript,
    command: `npm run ${step.npmScript}`,
    status: "succeeded" as const,
    exitCode: 0,
    durationMs:
      step.id === "research-harness"
        ? 12000
        : step.id === "mispricing-atlas"
          ? 6000
          : step.id === "artifact-index"
            ? 2500
            : step.id === "research-dashboard"
              ? 1800
              : 400,
    outputsGenerated: [...step.expectedOutputs],
    warnings: [],
  }));

  return {
    "data/research-results/full-research-summary.json": stableStringify({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/full-research-summary.json",
      config: { ...CONFIG, runMode: "read-only" },
      status: "succeeded",
      steps,
    }),
    "data/research-results/research-artifact-index.json": stableStringify({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/research-artifact-index.json",
      artifacts: [
        {
          artifactId: "mispricing-atlas",
          name: "Mispricing atlas",
          path: "data/research-results/mispricing-atlas.json",
          status: "present",
          fileSizeBytes: 512000,
          upstreamDependencies: [],
          downstreamConsumers: ["hypothesis-candidates"],
        },
        {
          artifactId: "data-health",
          name: "Data health",
          path: "data/research-results/data-health.json",
          status: "present",
          fileSizeBytes: 64000,
          upstreamDependencies: [],
          downstreamConsumers: [],
        },
      ],
    }),
    "data/research-results/historical-coverage-plan.json": stableStringify({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/historical-coverage-plan.json",
      snapshot: { marketCount: 42, researchOutputCount: 18 },
    }),
  };
}

describe("buildResearchPerformanceAudit", () => {
  it("builds a complete audit report with optimization opportunities", () => {
    const files = buildFixtureFiles();
    const config = defaultResearchPerformanceAuditConfig();

    const report = buildResearchPerformanceAudit({
      generatedAt: GENERATED_AT,
      config,
      io: {
        readFile: (path) => files[path] ?? "",
        fileExists: (path) => path in files,
      },
    });

    expect(report.steps).toHaveLength(17);
    expect(report.summary.totalRuntimeMs).toBeGreaterThan(0);
    expect(report.summary.estimatedParallelRuntimeMs).toBeLessThan(
      report.summary.totalRuntimeMs,
    );
    expect(report.criticalPath.stepIds.length).toBeGreaterThan(0);
    expect(report.optimizationOpportunities.length).toBeGreaterThan(0);
    expect(report.optimizationOpportunities.length).toBeLessThanOrEqual(10);
    expect(report.duplicateArtifactLoads.length).toBeGreaterThan(0);
    expect(report.duplicateFilesystemScans.length).toBeGreaterThan(0);
    expect(report.parallelExecutionGroups.length).toBeGreaterThan(0);

    const harness = report.steps.find((step) => step.stepId === "research-harness");
    expect(harness?.durationMs).toBe(12000);
    expect(harness?.percentOfTotalRuntime).toBeGreaterThan(0);
  });

  it("serializes HTML containing summary and step table", () => {
    const files = buildFixtureFiles();
    const report = buildResearchPerformanceAudit({
      generatedAt: GENERATED_AT,
      config: defaultResearchPerformanceAuditConfig(),
      io: {
        readFile: (path) => files[path] ?? "",
        fileExists: (path) => path in files,
      },
    });

    const html = serializeResearchPerformanceAuditHtml(report);
    expect(html).toContain("Research Pipeline Performance Audit");
    expect(html).toContain("research-harness");
    expect(html).toContain("Top optimization opportunities");
    expect(html).toContain("Critical path");
  });

  it("notes missing optional inputs without failing", () => {
    const files = {
      "data/research-results/full-research-summary.json":
        buildFixtureFiles()["data/research-results/full-research-summary.json"]!,
    };

    const report = buildResearchPerformanceAudit({
      generatedAt: GENERATED_AT,
      config: defaultResearchPerformanceAuditConfig(),
      io: {
        readFile: (path) => files[path] ?? "",
        fileExists: (path) => path in files,
      },
    });

    expect(report.inputStatus.artifactIndexPresent).toBe(false);
    expect(report.auditNotes.some((note) => note.includes("Artifact index missing"))).toBe(
      true,
    );
    expect(report.cacheOpportunities).toHaveLength(0);
  });
});
