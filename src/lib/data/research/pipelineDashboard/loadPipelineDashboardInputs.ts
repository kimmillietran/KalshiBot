import { z } from "zod";

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
    tryReadDocument(io, inputPaths.harnessResultsPath, harnessResultsSchema)
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

/** Loads optional pipeline dashboard artifacts without mutating data. */
export function loadPipelineDashboardInputs(
  io: PipelineDashboardIo,
  inputPaths: PipelineDashboardInputPaths,
): ParsedPipelineDashboardInputs {
  return {
    pipelineSummary: tryReadDocument(
      io,
      inputPaths.pipelineSummaryPath,
      pipelineSummarySchema,
    ),
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
  };
}
