import { describe, expect, it } from "vitest";

import { createDefaultFullResearchOrchestratorConfig } from "@/lib/data/research/fullOrchestrator/runFullResearchOrchestrator";
import type { FullResearchSummary } from "@/lib/data/research/fullOrchestrator/fullResearchOrchestratorTypes";

import {
  computeCriticalPath,
  findDuplicateArtifactLoads,
  findDuplicateFilesystemScans,
  findParallelExecutionGroups,
} from "./analyzePerformanceOpportunities";
import { buildFullResearchSteps } from "@/lib/data/research/fullOrchestrator/buildFullResearchSteps";
import { buildPipelineStepResourceProfiles } from "./pipelineStepResourceProfiles";
import type { PerformanceAuditStepReport } from "./performanceAuditTypes";

const CONFIG = createDefaultFullResearchOrchestratorConfig();

describe("analyzePerformanceOpportunities", () => {
  it("identifies parallel groups at orchestrator wave zero", () => {
    const steps = buildFullResearchSteps(CONFIG);
    const durations = new Map(
      steps.map((step) => [step.id, step.id === "data-health" ? 1000 : step.id === "coverage-plan" ? 800 : 100]),
    );

    const groups = findParallelExecutionGroups(steps, durations);
    const waveZero = groups.find((group) => group.stepIds.includes("data-health"));

    expect(waveZero?.stepIds).toEqual(
      expect.arrayContaining(["data-health", "coverage-plan"]),
    );
    expect(waveZero?.estimatedSavingsMs).toBeGreaterThan(0);
  });

  it("computes critical path through the core analysis chain", () => {
    const steps = buildFullResearchSteps(CONFIG);
    const durations = new Map(
      steps.map((step) => [
        step.id,
        step.id === "research-harness"
          ? 5000
          : step.id === "mispricing-atlas"
            ? 3000
            : 500,
      ]),
    );

    const criticalPath = computeCriticalPath(steps, durations);
    expect(criticalPath.stepIds).toContain("mispricing-atlas");
    expect(criticalPath.stepIds).toContain("research-harness");
    expect(criticalPath.totalDurationMs).toBeGreaterThan(5000);
  });

  it("detects duplicate artifact loads across reporting steps", () => {
    const stepReports: PerformanceAuditStepReport[] = [
      {
        stepId: "coverage-plan",
        label: "Coverage",
        npmScript: "research:coverage-plan",
        status: "succeeded",
        durationMs: 1000,
        percentOfTotalRuntime: 10,
        filesRead: ["data/research-results/mispricing-atlas.json"],
        filesWritten: [],
        upstreamDependencies: [],
        downstreamDependents: [],
        primaryArtifactSizeBytes: null,
        cpuBoundEstimateMs: 250,
        ioBoundEstimateMs: 750,
        networkEstimateMs: 0,
      },
      {
        stepId: "hypothesis-validation",
        label: "Validation",
        npmScript: "research:hypothesis-validation",
        status: "succeeded",
        durationMs: 2000,
        percentOfTotalRuntime: 20,
        filesRead: ["data/research-results/mispricing-atlas.json"],
        filesWritten: [],
        upstreamDependencies: [],
        downstreamDependents: [],
        primaryArtifactSizeBytes: null,
        cpuBoundEstimateMs: 1400,
        ioBoundEstimateMs: 600,
        networkEstimateMs: 0,
      },
    ];

    const duplicates = findDuplicateArtifactLoads(stepReports);
    expect(duplicates[0]?.artifactPath).toBe("data/research-results/mispricing-atlas.json");
    expect(duplicates[0]?.readingStepIds).toEqual(["coverage-plan", "hypothesis-validation"]);
  });

  it("detects duplicate filesystem scans across data-health and artifact-index", () => {
    const profiles = [...buildPipelineStepResourceProfiles().values()];
    const durations = new Map([
      ["data-health", 2000],
      ["artifact-index", 1500],
    ]);

    const duplicates = findDuplicateFilesystemScans(profiles, durations);
    const importsScan = duplicates.find((entry) => entry.rootPath === "data/imports");

    expect(importsScan?.scanningStepIds).toEqual(
      expect.arrayContaining(["data-health", "artifact-index"]),
    );
    expect(importsScan?.estimatedWastedMs).toBeGreaterThan(0);
  });
});

describe("full research summary fixture shape", () => {
  it("accepts minimal orchestrator summary for audit ingestion", () => {
    const summary: FullResearchSummary = {
      generatedAt: "2026-07-03T22:00:00.000Z",
      outputPath: "data/research-results/full-research-summary.json",
      config: {
        ...CONFIG,
        runMode: "read-only",
      },
      status: "succeeded",
      steps: buildFullResearchSteps(CONFIG).map((step) => ({
        stepId: step.id,
        label: step.label,
        npmScript: step.npmScript,
        command: `npm run ${step.npmScript}`,
        status: "succeeded" as const,
        exitCode: 0,
        durationMs: step.id === "research-harness" ? 8000 : 500,
        outputsGenerated: [...step.expectedOutputs],
        warnings: [],
      })),
    };

    expect(summary.steps).toHaveLength(17);
    expect(summary.steps.find((step) => step.stepId === "artifact-index")?.durationMs).toBe(500);
  });
});
