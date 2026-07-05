import { z } from "zod";

import { parseExpansionImportSummaryJson } from "@/lib/data/research/coveragePlanner/importability";

import {
  PipelineDashboardError,
  type ParsedPipelineDashboardInputs,
  type PipelineDashboardInputPaths,
  type PipelineDashboardIo,
} from "./pipelineDashboardTypes";

const pipelineSummarySchema = z.object({
  generatedAt: z.string().trim().min(1),
  status: z.enum(["succeeded", "failed", "partial"]),
  steps: z.array(
    z.object({
      stepId: z.string().trim().min(1),
      label: z.string().trim().min(1),
      status: z.enum(["succeeded", "failed", "skipped"]),
      durationMs: z.number().finite(),
    }),
  ),
});

const fullResearchSummarySchema = pipelineSummarySchema.extend({
  config: z
    .object({
      runMode: z.enum(["read-only", "import-executing"]).optional(),
      executeExpansionImport: z.boolean().optional(),
    })
    .optional(),
});

const generatedArtifactSchema = z.object({
  generatedAt: z.string().trim().min(1),
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
      generatedTimestamp: z.string().nullable(),
    }),
  ),
});

const hypothesisCandidatesSchema = z.object({
  generatedAt: z.string().trim().min(1),
  candidates: z.array(z.object({ candidateId: z.string().trim().min(1) })),
});

const hypothesisValidationSchema = z.object({
  generatedAt: z.string().trim().min(1),
  validations: z.array(
    z.object({
      hypothesisId: z.string().trim().min(1),
      passes: z.boolean(),
    }),
  ),
  summary: z.object({
    passingCount: z.number().finite(),
    failingCount: z.number().finite(),
  }),
});

const strategySynthesisSchema = z.object({
  generatedAt: z.string().trim().min(1),
  strategies: z.array(
    z.object({
      strategyId: z.string().trim().min(1),
      hypothesisId: z.string().trim().min(1),
      promotionStatus: z.enum(["experimental", "candidate", "rejected"]),
    }),
  ),
  summary: z.object({
    synthesizedCount: z.number().finite(),
    promotionCounts: z.object({
      experimental: z.number().finite(),
      candidate: z.number().finite(),
      rejected: z.number().finite(),
    }),
  }),
});

const harnessResultsSchema = z.object({
  completedAt: z.string().trim().min(1),
  evaluatedStrategies: z.number().finite(),
  successfulRuns: z.number().finite(),
  results: z.array(
    z.object({
      synthesizedStrategyId: z.string().trim().min(1),
      hypothesisId: z.string().trim().min(1),
      status: z.enum(["success", "failed", "skipped"]),
    }),
  ),
});

const harnessResultsReportSchema = z.object({
  generatedAt: z.string().trim().min(1),
  summary: z.object({
    evaluatedCount: z.number().finite(),
  }),
  strategies: z.array(
    z.object({
      strategyId: z.string().trim().min(1),
      hypothesisId: z.string().trim().min(1),
      harnessRuns: z.object({
        total: z.number().finite(),
        successful: z.number().finite(),
        failed: z.number().finite(),
        skipped: z.number().finite(),
      }),
    }),
  ),
});

type ParsedHarnessResults = z.infer<typeof harnessResultsSchema>;

function normalizeHarnessResultsReport(
  report: z.infer<typeof harnessResultsReportSchema>,
): ParsedHarnessResults {
  const results = report.strategies.flatMap((strategy) => [
    ...Array.from({ length: strategy.harnessRuns.successful }, () => ({
      synthesizedStrategyId: strategy.strategyId,
      hypothesisId: strategy.hypothesisId,
      status: "success" as const,
    })),
    ...Array.from({ length: strategy.harnessRuns.failed }, () => ({
      synthesizedStrategyId: strategy.strategyId,
      hypothesisId: strategy.hypothesisId,
      status: "failed" as const,
    })),
    ...Array.from({ length: strategy.harnessRuns.skipped }, () => ({
      synthesizedStrategyId: strategy.strategyId,
      hypothesisId: strategy.hypothesisId,
      status: "skipped" as const,
    })),
  ]);

  return {
    completedAt: report.generatedAt,
    evaluatedStrategies: report.summary.evaluatedCount,
    successfulRuns: results.filter((result) => result.status === "success").length,
    results,
  };
}

function tryReadHarnessResultsDocument(
  io: PipelineDashboardIo,
  path: string,
): ParsedHarnessResults | null {
  if (!io.fileExists(path)) {
    return null;
  }

  const parsed = parseJson(path, io.readFile(path));
  const legacy = harnessResultsSchema.safeParse(parsed);
  if (legacy.success) {
    return legacy.data;
  }

  const report = harnessResultsReportSchema.safeParse(parsed);
  if (report.success) {
    return normalizeHarnessResultsReport(report.data);
  }

  return null;
}

const strategyLeaderboardSchema = z.object({
  generatedAt: z.string().trim().min(1),
  rankBy: z.string().trim().min(1),
  strategies: z.array(
    z.object({
      rank: z.number().finite(),
      strategyId: z.string().trim().min(1),
      totalPnlCents: z.number().finite(),
    }),
  ),
});

const dataHealthSchema = z.object({
  generatedAt: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  pipelineCoverage: z.object({
    calibrationReports: z.number().finite(),
    researchOutputs: z.number().finite(),
  }),
  researchCoverage: z.object({
    calibrationCoveragePct: z.number().finite().nullable(),
    mispricingAtlasPresent: z.boolean(),
  }),
  artifactFreshness: z.object({
    staleDependencyWarnings: z.array(z.object({ message: z.string().trim().min(1) })),
  }),
  stageStatuses: z.array(
    z.object({
      stageLabel: z.string().trim().min(1),
      status: z.enum(["green", "yellow", "red"]),
      reason: z.string().trim().min(1),
    }),
  ),
  recommendations: z.array(
    z.object({
      action: z.string().trim().min(1),
      reason: z.string().trim().min(1),
    }),
  ),
});

const mispricingAtlasSchema = z.object({
  sampleCounts: z
    .object({
      totalAtlasObservations: z.number().finite().optional(),
    })
    .optional(),
  summary: z
    .object({
      totalAtlasObservations: z.number().finite().optional(),
    })
    .optional(),
});

const historicalCoveragePlanSchema = z.object({
  generatedAt: z.string().trim().min(1),
  summary: z
    .object({
      currentMarketCount: z.number().finite().optional(),
      uniqueTradingDays: z.number().finite().optional(),
      missingMonths: z.array(z.string()).optional(),
      recommendedImportWindows: z.array(z.unknown()).optional(),
    })
    .optional(),
});

const historicalExpansionConfigSchema = z.object({
  generatedAt: z.string().trim().min(1),
  jobs: z.array(z.unknown()).optional(),
  summary: z
    .object({
      jobCount: z.number().finite().optional(),
      scheduledJobCount: z.number().finite().optional(),
      estimatedMarketCount: z.number().finite().optional(),
    })
    .optional(),
});

const coverageValidationSchema = z.object({
  generatedAt: z.string().trim().min(1),
  summary: z
    .object({
      inconclusiveInsufficientCoverageCount: z.number().finite().optional(),
    })
    .optional(),
});

function normalizeHistoricalCoveragePlan(
  document: z.infer<typeof historicalCoveragePlanSchema>,
): ParsedPipelineDashboardInputs["historicalCoveragePlan"] {
  return {
    generatedAt: document.generatedAt,
    summary: {
      currentMarketCount: document.summary?.currentMarketCount ?? null,
      uniqueTradingDays: document.summary?.uniqueTradingDays ?? null,
      missingMonths: document.summary?.missingMonths ?? [],
      recommendedImportWindows: document.summary?.recommendedImportWindows ?? [],
    },
  };
}

function normalizeHistoricalExpansionConfig(
  document: z.infer<typeof historicalExpansionConfigSchema>,
): ParsedPipelineDashboardInputs["historicalExpansionConfig"] {
  return {
    generatedAt: document.generatedAt,
    jobs: document.jobs ?? [],
    summary: {
      jobCount:
        document.summary?.jobCount
        ?? document.summary?.scheduledJobCount
        ?? null,
      estimatedMarketCount: document.summary?.estimatedMarketCount ?? null,
    },
  };
}

function normalizeCoverageValidation(
  document: z.infer<typeof coverageValidationSchema>,
): ParsedPipelineDashboardInputs["coverageValidation"] {
  return {
    generatedAt: document.generatedAt,
    summary: {
      inconclusiveInsufficientCoverageCount:
        document.summary?.inconclusiveInsufficientCoverageCount ?? null,
    },
  };
}

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new PipelineDashboardError(`Invalid JSON in ${path}`);
  }
}

function tryReadDocument<T>(
  io: PipelineDashboardIo,
  path: string,
  schema: z.ZodType<T>,
): T | null {
  if (!io.fileExists(path)) {
    return null;
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new PipelineDashboardError(
      `Invalid document schema in ${path}: ${result.error.message}`,
    );
  }

  return result.data;
}

function readHarnessResults(
  io: PipelineDashboardIo,
  inputPaths: PipelineDashboardInputPaths,
) {
  return (
    tryReadHarnessResultsDocument(io, inputPaths.harnessResultsPath)
    ?? tryReadHarnessResultsDocument(io, inputPaths.harnessSummaryFallbackPath)
    ?? tryReadDocument(io, inputPaths.harnessSummaryFallbackPath, harnessResultsSchema)
  );
}

function readMispricingAtlasSummary(
  io: PipelineDashboardIo,
  path: string,
) {
  const document = tryReadDocument(io, path, mispricingAtlasSchema);
  if (!document) {
    return null;
  }

  const totalAtlasObservations =
    document.sampleCounts?.totalAtlasObservations
    ?? document.summary?.totalAtlasObservations
    ?? null;

  return { totalAtlasObservations };
}

function readHistoricalCoveragePlan(
  io: PipelineDashboardIo,
  path: string,
): ParsedPipelineDashboardInputs["historicalCoveragePlan"] {
  const document = tryReadDocument(io, path, historicalCoveragePlanSchema);
  return document ? normalizeHistoricalCoveragePlan(document) : null;
}

function readHistoricalExpansionConfig(
  io: PipelineDashboardIo,
  path: string,
): ParsedPipelineDashboardInputs["historicalExpansionConfig"] {
  const document = tryReadDocument(io, path, historicalExpansionConfigSchema);
  return document ? normalizeHistoricalExpansionConfig(document) : null;
}

function readCoverageValidation(
  io: PipelineDashboardIo,
  path: string,
): ParsedPipelineDashboardInputs["coverageValidation"] {
  const document = tryReadDocument(io, path, coverageValidationSchema);
  return document ? normalizeCoverageValidation(document) : null;
}

function readFullResearchSummary(
  io: PipelineDashboardIo,
  path: string,
): {
  summary: ParsedPipelineDashboardInputs["fullResearchSummary"];
  orchestrator: ParsedPipelineDashboardInputs["fullResearchOrchestrator"];
} {
  if (!io.fileExists(path)) {
    return { summary: null, orchestrator: null };
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = fullResearchSummarySchema.safeParse(parsed);
  if (!result.success) {
    throw new PipelineDashboardError(
      `Invalid document schema in ${path}: ${result.error.message}`,
    );
  }

  const { config, ...summaryFields } = result.data;

  return {
    summary: summaryFields,
    orchestrator: config
      ? {
          runMode:
            config.runMode
            ?? (config.executeExpansionImport ? "import-executing" : "read-only"),
          executeExpansionImport: config.executeExpansionImport ?? false,
        }
      : null,
  };
}

function readHistoricalExpansionImportSummary(
  io: PipelineDashboardIo,
  path: string,
): ParsedPipelineDashboardInputs["historicalExpansionImportSummary"] {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    const document = parseExpansionImportSummaryJson(path, io.readFile(path));
    return {
      generatedAt: document.generatedAt,
      document,
    };
  } catch (error) {
    throw new PipelineDashboardError(
      error instanceof Error ? error.message : `Failed to read ${path}`,
    );
  }
}

function readGeneratedArtifact(
  io: PipelineDashboardIo,
  path: string,
): { generatedAt: string } | null {
  return tryReadDocument(io, path, generatedArtifactSchema);
}

/** Loads optional pipeline dashboard artifacts without mutating data. */
export function loadPipelineDashboardInputs(
  io: PipelineDashboardIo,
  inputPaths: PipelineDashboardInputPaths,
): ParsedPipelineDashboardInputs {
  const fullResearch = readFullResearchSummary(io, inputPaths.fullResearchSummaryPath);

  return {
    pipelineSummary: tryReadDocument(
      io,
      inputPaths.pipelineSummaryPath,
      pipelineSummarySchema,
    ),
    fullResearchSummary: fullResearch.summary,
    fullResearchOrchestrator: fullResearch.orchestrator,
    artifactIndex: tryReadDocument(
      io,
      inputPaths.artifactIndexPath,
      artifactIndexSchema,
    ),
    hypothesisCandidates: tryReadDocument(
      io,
      inputPaths.hypothesisCandidatesPath,
      hypothesisCandidatesSchema,
    ),
    hypothesisValidation: tryReadDocument(
      io,
      inputPaths.hypothesisValidationPath,
      hypothesisValidationSchema,
    ),
    strategySynthesis: tryReadDocument(
      io,
      inputPaths.strategySynthesisPath,
      strategySynthesisSchema,
    ),
    harnessResults: readHarnessResults(io, inputPaths),
    strategyLeaderboard: tryReadDocument(
      io,
      inputPaths.strategyLeaderboardPath,
      strategyLeaderboardSchema,
    ),
    dataHealth: tryReadDocument(io, inputPaths.dataHealthPath, dataHealthSchema),
    mispricingAtlas: readMispricingAtlasSummary(
      io,
      "data/research-results/mispricing-atlas.json",
    ),
    historicalCoveragePlan: readHistoricalCoveragePlan(
      io,
      inputPaths.historicalCoveragePlanPath,
    ),
    historicalExpansionConfig: readHistoricalExpansionConfig(
      io,
      inputPaths.historicalExpansionConfigPath,
    ),
    coverageValidation: readCoverageValidation(io, inputPaths.coverageValidationPath),
    historicalExpansionImportSummary: readHistoricalExpansionImportSummary(
      io,
      inputPaths.historicalExpansionImportSummaryPath,
    ),
    expansionRebuildSummary: readGeneratedArtifact(io, inputPaths.expansionRebuildSummaryPath),
  };
}
