import { z } from "zod";

import type { FullResearchSummary } from "@/lib/data/research/fullOrchestrator/fullResearchOrchestratorTypes";
import type { ResearchArtifactIndex } from "@/lib/data/research/artifactIndex/researchArtifactIndexTypes";
import type { HistoricalCoveragePlanReport } from "@/lib/data/research/coveragePlanner/coveragePlannerTypes";
import type { ResearchExperimentIndex } from "@/lib/data/research/experimentManager/experimentManagerTypes";

import {
  PerformanceAuditError,
  PerformanceAuditErrorCode,
  type PerformanceAuditConfig,
  type PerformanceAuditInputStatus,
  type PerformanceAuditIo,
} from "./performanceAuditTypes";

const fullResearchSummarySchema = z.object({
  generatedAt: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  config: z
    .object({
      continueOnError: z.boolean(),
      summaryOutputPath: z.string().trim().min(1),
      executeExpansionImport: z.boolean().optional(),
      expansionImportMaxMarkets: z.number().nullable().optional(),
      expansionImportJobId: z.string().nullable().optional(),
      expansionImportResume: z.boolean().optional(),
      runMode: z.enum(["read-only", "import-executing"]).optional(),
    })
    .passthrough(),
  status: z.enum(["succeeded", "failed", "partial"]),
  steps: z.array(
    z
      .object({
        stepId: z.string().trim().min(1),
        label: z.string().trim().min(1),
        npmScript: z.string().trim().min(1),
        status: z.enum(["succeeded", "failed", "skipped"]),
        durationMs: z.number().finite(),
        outputsGenerated: z.array(z.string()).optional(),
        executionRisk: z.enum(["import-execution", "networked-rebuild"]).optional(),
      })
      .passthrough(),
  ),
});

const artifactIndexSchema = z.object({
  generatedAt: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  artifacts: z.array(
    z.object({
      artifactId: z.string().trim().min(1),
      name: z.string().trim().min(1),
      path: z.string().trim().min(1),
      status: z.enum(["present", "stale", "missing"]),
      fileSizeBytes: z.number().nullable(),
      upstreamDependencies: z.array(z.string()).optional(),
      downstreamConsumers: z.array(z.string()).optional(),
    }),
  ),
});

const coveragePlanSchema = z.object({
  generatedAt: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  snapshot: z
    .object({
      marketCount: z.number().finite(),
      researchOutputCount: z.number().finite().optional(),
    })
    .passthrough(),
});

const experimentIndexSchema = z.object({
  generatedAt: z.string().trim().min(1),
  experiments: z.array(
    z.object({
      experimentId: z.string().trim().min(1),
      registeredAt: z.string().trim().min(1),
    }),
  ),
});

function parseJsonFile<T>(
  path: string,
  schema: z.ZodType<T>,
  io: PerformanceAuditIo,
  required: boolean,
): T | null {
  if (!io.fileExists(path)) {
    if (required) {
      throw new PerformanceAuditError(
        `Required input not found: ${path}`,
        PerformanceAuditErrorCode.MISSING_INPUT,
      );
    }
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(io.readFile(path));
  } catch {
    throw new PerformanceAuditError(
      `Invalid JSON in ${path}`,
      PerformanceAuditErrorCode.INVALID_JSON,
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new PerformanceAuditError(
      `Invalid document in ${path}: ${result.error.message}`,
      PerformanceAuditErrorCode.INVALID_DOCUMENT,
    );
  }

  return result.data;
}

export type LoadedPerformanceAuditInputs = {
  inputStatus: PerformanceAuditInputStatus;
  fullResearchSummary: FullResearchSummary;
  artifactIndex: ResearchArtifactIndex | null;
  coveragePlan: HistoricalCoveragePlanReport | null;
  experimentIndex: ResearchExperimentIndex | null;
};

export function loadPerformanceAuditInputs(
  config: PerformanceAuditConfig,
  io: PerformanceAuditIo,
): LoadedPerformanceAuditInputs {
  const fullResearchSummaryRaw = parseJsonFile(
    config.fullResearchSummaryPath,
    fullResearchSummarySchema,
    io,
    true,
  )!;

  const fullResearchSummary = fullResearchSummaryRaw as unknown as FullResearchSummary;

  const artifactIndexRaw = parseJsonFile(
    config.artifactIndexPath,
    artifactIndexSchema,
    io,
    false,
  );
  const coveragePlanRaw = parseJsonFile(
    config.historicalCoveragePlanPath,
    coveragePlanSchema,
    io,
    false,
  );
  const experimentIndexRaw = parseJsonFile(
    config.experimentIndexPath,
    experimentIndexSchema,
    io,
    false,
  );

  return {
    inputStatus: {
      fullResearchSummaryPresent: true,
      artifactIndexPresent: artifactIndexRaw !== null,
      historicalCoveragePlanPresent: coveragePlanRaw !== null,
      experimentIndexPresent: experimentIndexRaw !== null,
    },
    fullResearchSummary,
    artifactIndex: artifactIndexRaw as ResearchArtifactIndex | null,
    coveragePlan: coveragePlanRaw as HistoricalCoveragePlanReport | null,
    experimentIndex: experimentIndexRaw as ResearchExperimentIndex | null,
  };
}
