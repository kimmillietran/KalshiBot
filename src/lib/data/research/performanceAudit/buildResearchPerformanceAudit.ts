import type { ResearchArtifactIndex } from "@/lib/data/research/artifactIndex/researchArtifactIndexTypes";
import { buildFullResearchSteps } from "@/lib/data/research/fullOrchestrator/buildFullResearchSteps";
import { createDefaultFullResearchOrchestratorConfig } from "@/lib/data/research/fullOrchestrator/runFullResearchOrchestrator";
import type {
  FullResearchOrchestratorConfig,
  FullResearchStepDefinition,
  FullResearchStepResult,
} from "@/lib/data/research/fullOrchestrator/fullResearchOrchestratorTypes";

import {
  buildDownstreamMap,
  computeCriticalPath,
  estimateParallelRuntimeMs,
  findCacheOpportunities,
  findDuplicateArtifactLoads,
  findDuplicateFilesystemScans,
  findIncrementalRebuildOpportunities,
  findMemoryObservations,
  findNetworkBottlenecks,
  findParallelExecutionGroups,
  rankOptimizationOpportunities,
  resolveArtifactSizeBytes,
} from "./analyzePerformanceOpportunities";
import { loadPerformanceAuditInputs } from "./loadPerformanceAuditInputs";
import {
  buildPipelineStepResourceProfiles,
  getPipelineStepResourceProfile,
} from "./pipelineStepResourceProfiles";
import type {
  BuildResearchPerformanceAuditInput,
  PerformanceAuditReport,
  PerformanceAuditStepReport,
  PipelineStepResourceProfile,
} from "./performanceAuditTypes";

function resolveOrchestratorConfig(
  summaryConfig: FullResearchOrchestratorConfig | (FullResearchOrchestratorConfig & { runMode?: string }),
): FullResearchOrchestratorConfig {
  const defaults = createDefaultFullResearchOrchestratorConfig();
  return {
    continueOnError: summaryConfig.continueOnError ?? defaults.continueOnError,
    summaryOutputPath: summaryConfig.summaryOutputPath ?? defaults.summaryOutputPath,
    executeExpansionImport:
      summaryConfig.executeExpansionImport ?? defaults.executeExpansionImport,
    expansionImportMaxMarkets:
      summaryConfig.expansionImportMaxMarkets ?? defaults.expansionImportMaxMarkets,
    expansionImportJobId:
      summaryConfig.expansionImportJobId ?? defaults.expansionImportJobId,
    expansionImportResume:
      summaryConfig.expansionImportResume ?? defaults.expansionImportResume,
  };
}

function buildStepReports(input: {
  stepDefinitions: readonly FullResearchStepDefinition[];
  stepResultsById: ReadonlyMap<string, FullResearchStepResult>;
  profiles: ReadonlyMap<string, PipelineStepResourceProfile>;
  downstreamByStep: ReadonlyMap<string, readonly string[]>;
  totalRuntimeMs: number;
  artifactIndex: ResearchArtifactIndex | null;
}): PerformanceAuditStepReport[] {
  return input.stepDefinitions.map((step) => {
    const profile = getPipelineStepResourceProfile(step.id, input.profiles);
    const summaryStep = input.stepResultsById.get(step.id);
    const durationMs = summaryStep?.durationMs ?? 0;
    const status = summaryStep?.status ?? "not-run";
    const primaryOutput = step.expectedOutputs[0] ?? profile.filesWritten[0] ?? null;
    const networkShare = Math.min(
      1,
      profile.networkOperations.reduce((sum, operation) => sum + operation.estimatedShare, 0),
    );
    const networkEstimateMs = Math.round(durationMs * networkShare);
    const remainingMs = Math.max(0, durationMs - networkEstimateMs);
    const cpuBoundEstimateMs = Math.round(remainingMs * profile.cpuBoundShare);
    const ioBoundEstimateMs = Math.max(0, remainingMs - cpuBoundEstimateMs);

    return {
      stepId: step.id,
      label: step.label,
      npmScript: step.npmScript,
      status,
      durationMs,
      percentOfTotalRuntime:
        input.totalRuntimeMs > 0 ? Number(((durationMs / input.totalRuntimeMs) * 100).toFixed(2)) : 0,
      filesRead: profile.filesRead,
      filesWritten: [...step.expectedOutputs, ...profile.filesWritten].filter(
        (path, index, paths) => paths.indexOf(path) === index,
      ),
      upstreamDependencies: step.upstreamStepIds,
      downstreamDependents: input.downstreamByStep.get(step.id) ?? [],
      primaryArtifactSizeBytes:
        primaryOutput !== null
          ? resolveArtifactSizeBytes(primaryOutput, input.artifactIndex)
          : null,
      cpuBoundEstimateMs,
      ioBoundEstimateMs,
      networkEstimateMs,
      executionRisk: step.executionRisk,
    };
  });
}

/** Builds the research pipeline performance audit report from orchestrator telemetry. */
export function buildResearchPerformanceAudit(
  input: BuildResearchPerformanceAuditInput,
): PerformanceAuditReport {
  const loaded = loadPerformanceAuditInputs(input.config, input.io);
  const orchestratorConfig = resolveOrchestratorConfig(loaded.fullResearchSummary.config);
  const stepDefinitions = buildFullResearchSteps(orchestratorConfig);
  const profiles = buildPipelineStepResourceProfiles();

  const stepResultsById = new Map(
    loaded.fullResearchSummary.steps.map((step) => [step.stepId, step]),
  );
  const durationByStep = new Map(
    loaded.fullResearchSummary.steps.map((step) => [step.stepId, step.durationMs]),
  );

  for (const step of stepDefinitions) {
    if (!durationByStep.has(step.id)) {
      durationByStep.set(step.id, 0);
    }
  }

  const totalRuntimeMs = loaded.fullResearchSummary.steps.reduce(
    (sum, step) => sum + step.durationMs,
    0,
  );

  const downstreamByStep = buildDownstreamMap(stepDefinitions);
  const stepReports = buildStepReports({
    stepDefinitions,
    stepResultsById,
    profiles,
    downstreamByStep,
    totalRuntimeMs,
    artifactIndex: loaded.artifactIndex,
  });

  const activeProfiles = stepDefinitions.map((step) =>
    getPipelineStepResourceProfile(step.id, profiles),
  );

  const parallelExecutionGroups = findParallelExecutionGroups(stepDefinitions, durationByStep);
  const duplicateArtifactLoads = findDuplicateArtifactLoads(stepReports);
  const duplicateFilesystemScans = findDuplicateFilesystemScans(activeProfiles, durationByStep);
  const cacheOpportunities = findCacheOpportunities(
    stepDefinitions,
    activeProfiles,
    durationByStep,
    loaded.artifactIndex,
  );
  const incrementalRebuildOpportunities = findIncrementalRebuildOpportunities(
    activeProfiles,
    durationByStep,
  );
  const networkBottlenecks = findNetworkBottlenecks(activeProfiles, durationByStep);
  const memoryObservations = findMemoryObservations(activeProfiles, loaded.artifactIndex);
  const criticalPath = computeCriticalPath(stepDefinitions, durationByStep);

  const estimatedParallelRuntimeMs = estimateParallelRuntimeMs(stepDefinitions, durationByStep);
  const estimatedCacheSavingsMs = cacheOpportunities.reduce(
    (sum, entry) => sum + entry.estimatedSavingsMs,
    0,
  );
  const estimatedIncrementalRebuildSavingsMs = incrementalRebuildOpportunities.reduce(
    (sum, entry) => sum + entry.estimatedSavingsMs,
    0,
  );

  const succeededStepCount = loaded.fullResearchSummary.steps.filter(
    (step) => step.status === "succeeded",
  ).length;
  const failedStepCount = loaded.fullResearchSummary.steps.filter(
    (step) => step.status === "failed",
  ).length;
  const skippedStepCount = loaded.fullResearchSummary.steps.filter(
    (step) => step.status === "skipped",
  ).length;

  const auditNotes: string[] = [
    "Diagnostic-only audit; no pipeline behavior was modified.",
    `Analyzed ${stepDefinitions.length} configured steps from full-research orchestrator definition.`,
  ];

  if (!loaded.inputStatus.artifactIndexPresent) {
    auditNotes.push(
      "Artifact index missing; artifact sizes and cache heuristics use reduced fidelity.",
    );
  }

  if (!loaded.inputStatus.historicalCoveragePlanPresent) {
    auditNotes.push("Historical coverage plan missing; coverage-phase context omitted.");
  }

  if (!loaded.inputStatus.experimentIndexPresent) {
    auditNotes.push("Experiment index not found; experiment history cross-check skipped.");
  } else if (loaded.experimentIndex) {
    auditNotes.push(
      `Experiment history available (${loaded.experimentIndex.experiments.length} registered experiments).`,
    );
  }

  if (loaded.coveragePlan) {
    auditNotes.push(
      `Coverage plan snapshot: ${loaded.coveragePlan.snapshot.marketCount} markets tracked.`,
    );
  }

  const optimizationOpportunities = rankOptimizationOpportunities({
    parallelGroups: parallelExecutionGroups,
    duplicateLoads: duplicateArtifactLoads,
    duplicateScans: duplicateFilesystemScans,
    cacheOpportunities,
    incrementalRebuilds: incrementalRebuildOpportunities,
    networkBottlenecks,
    memoryObservations,
    criticalPath,
  });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
    config: input.config,
    orchestratorConfig,
    inputStatus: loaded.inputStatus,
    summary: {
      totalRuntimeMs,
      estimatedParallelRuntimeMs,
      estimatedCacheSavingsMs,
      estimatedIncrementalRebuildSavingsMs,
      stepCount: stepDefinitions.length,
      succeededStepCount,
      failedStepCount,
      skippedStepCount,
    },
    steps: stepReports,
    parallelExecutionGroups,
    duplicateArtifactLoads,
    duplicateFilesystemScans,
    cacheOpportunities,
    incrementalRebuildOpportunities,
    networkBottlenecks,
    memoryObservations,
    criticalPath,
    optimizationOpportunities,
    auditNotes,
  };
}
