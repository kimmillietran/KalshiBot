import { z } from "zod";

import {
  RESEARCH_CANDIDATE_STATUSES,
  ResearchCandidateRegistryError,
  type ParsedResearchCandidateRegistryInputs,
  type ResearchCandidateRegistryInputPaths,
  type ResearchCandidateRegistryIo,
  type ResearchCandidateRegistryReport,
} from "./researchCandidateRegistryTypes";

const hypothesisCandidateSchema = z.object({
  candidateId: z.string().trim().min(1),
  suggestedStrategyFamily: z.string().trim().min(1),
  warnings: z.array(z.string().trim().min(1)),
});

const hypothesisCandidatesDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  candidates: z.array(hypothesisCandidateSchema),
});

const hypothesisValidationSchema = z.object({
  hypothesisId: z.string().trim().min(1),
  robustnessScore: z.number().finite(),
  passes: z.boolean(),
  reasons: z.array(z.string().trim().min(1)),
});

const hypothesisValidationDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  validations: z.array(hypothesisValidationSchema),
});

const synthesizedStrategySchema = z.object({
  strategyId: z.string().trim().min(1),
  hypothesisId: z.string().trim().min(1),
  strategyFamily: z.string().trim().min(1),
  promotionStatus: z.enum(["experimental", "candidate", "rejected"]),
  validationSummary: z.object({
    robustnessScore: z.number().finite().nullable(),
    passes: z.boolean(),
  }),
  riskNotes: z.array(z.string().trim().min(1)),
});

const strategySynthesisDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  strategies: z.array(synthesizedStrategySchema),
});

const harnessResultSchema = z.object({
  synthesizedStrategyId: z.string().trim().min(1),
  hypothesisId: z.string().trim().min(1),
  status: z.enum(["success", "failed", "skipped"]),
  errorMessage: z.string().nullable(),
});

const harnessResultsDocumentSchema = z.object({
  completedAt: z.string().trim().min(1),
  results: z.array(harnessResultSchema),
});

const harnessSummaryDocumentSchema = z.object({
  completedAt: z.string().trim().min(1).optional(),
  startedAt: z.string().trim().min(1).optional(),
  results: z.array(harnessResultSchema),
});

const harnessResultsM815CStrategySchema = z.object({
  strategyId: z.string().trim().min(1),
  hypothesisId: z.string().trim().min(1),
  harnessRuns: z.object({
    total: z.number().int().nonnegative(),
    successful: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
});

const harnessResultsM815CDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  strategies: z.array(harnessResultsM815CStrategySchema),
});

const promotionEventSchema = z.object({
  timestamp: z.string().trim().min(1),
  previousStatus: z.enum(RESEARCH_CANDIDATE_STATUSES).nullable(),
  nextStatus: z.enum(RESEARCH_CANDIDATE_STATUSES),
  reason: z.string().trim().min(1),
});

const registryEntrySchema = z.object({
  candidateId: z.string().trim().min(1),
  hypothesisId: z.string().trim().min(1),
  strategyId: z.string().nullable(),
  strategyFamily: z.string().trim().min(1),
  creationTimestamp: z.string().trim().min(1),
  validationScore: z.number().finite().nullable(),
  harnessMetrics: z
    .object({
      evaluatedRuns: z.number().finite(),
      successfulRuns: z.number().finite(),
      failedRuns: z.number().finite(),
      skippedRuns: z.number().finite(),
      lastHarnessCompletedAt: z.string().nullable(),
    })
    .nullable(),
  currentStatus: z.enum(RESEARCH_CANDIDATE_STATUSES),
  rejectionReasons: z.array(z.string().trim().min(1)),
  promotionHistory: z.array(promotionEventSchema),
});

const existingRegistrySchema = z.object({
  generatedAt: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  htmlOutputPath: z.string().trim().min(1),
  inputPaths: z.object({
    hypothesisCandidatesPath: z.string().trim().min(1),
    hypothesisValidationPath: z.string().trim().min(1),
    strategySynthesisPath: z.string().trim().min(1),
    harnessResultsPath: z.string().trim().min(1),
    harnessSummaryFallbackPath: z.string().trim().min(1),
    existingRegistryPath: z.string().trim().min(1),
  }),
  summary: z.object({
    totalCandidates: z.number().finite(),
    hypothesisCount: z.number().finite(),
    validatedCount: z.number().finite(),
    synthesizedCount: z.number().finite(),
    backtestedCount: z.number().finite(),
    candidateCount: z.number().finite(),
    rejectedCount: z.number().finite(),
  }),
  candidates: z.array(registryEntrySchema),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new ResearchCandidateRegistryError(`Invalid JSON in ${path}`);
  }
}

function tryReadDocument<T>(
  io: ResearchCandidateRegistryIo,
  path: string,
  schema: z.ZodType<T>,
): T | null {
  if (!io.fileExists(path)) {
    return null;
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ResearchCandidateRegistryError(
      `Invalid document schema in ${path}: ${result.error.message}`,
    );
  }

  return result.data;
}

function normalizeM815CHarnessResults(
  report: z.infer<typeof harnessResultsM815CDocumentSchema>,
): z.infer<typeof harnessResultsDocumentSchema> {
  const results: z.infer<typeof harnessResultSchema>[] = [];

  for (const strategy of report.strategies) {
    for (let index = 0; index < strategy.harnessRuns.successful; index += 1) {
      results.push({
        synthesizedStrategyId: strategy.strategyId,
        hypothesisId: strategy.hypothesisId,
        status: "success",
        errorMessage: null,
      });
    }
    for (let index = 0; index < strategy.harnessRuns.failed; index += 1) {
      results.push({
        synthesizedStrategyId: strategy.strategyId,
        hypothesisId: strategy.hypothesisId,
        status: "failed",
        errorMessage: null,
      });
    }
    for (let index = 0; index < strategy.harnessRuns.skipped; index += 1) {
      results.push({
        synthesizedStrategyId: strategy.strategyId,
        hypothesisId: strategy.hypothesisId,
        status: "skipped",
        errorMessage: null,
      });
    }
  }

  return {
    completedAt: report.generatedAt,
    results,
  };
}

function parseHarnessResultsDocument(
  path: string,
  json: string,
): z.infer<typeof harnessResultsDocumentSchema> | null {
  const parsed = parseJson(path, json);
  const legacy = harnessResultsDocumentSchema.safeParse(parsed);
  if (legacy.success) {
    return legacy.data;
  }

  const m815c = harnessResultsM815CDocumentSchema.safeParse(parsed);
  if (m815c.success) {
    return normalizeM815CHarnessResults(m815c.data);
  }

  return null;
}

function readHarnessResults(
  io: ResearchCandidateRegistryIo,
  inputPaths: ResearchCandidateRegistryInputPaths,
) {
  if (io.fileExists(inputPaths.harnessResultsPath)) {
    const parsed = parseHarnessResultsDocument(
      inputPaths.harnessResultsPath,
      io.readFile(inputPaths.harnessResultsPath),
    );
    if (parsed) {
      return parsed;
    }
  }

  const summary = tryReadDocument(
    io,
    inputPaths.harnessSummaryFallbackPath,
    harnessSummaryDocumentSchema,
  );

  if (!summary) {
    return null;
  }

  return {
    completedAt: summary.completedAt ?? summary.startedAt ?? "",
    results: summary.results,
  };
}

/** Loads optional candidate registry inputs without mutating upstream artifacts. */
export function loadResearchCandidateRegistryInputs(
  io: ResearchCandidateRegistryIo,
  inputPaths: ResearchCandidateRegistryInputPaths,
): ParsedResearchCandidateRegistryInputs {
  return {
    hypothesisCandidates: tryReadDocument(
      io,
      inputPaths.hypothesisCandidatesPath,
      hypothesisCandidatesDocumentSchema,
    ),
    hypothesisValidation: tryReadDocument(
      io,
      inputPaths.hypothesisValidationPath,
      hypothesisValidationDocumentSchema,
    ),
    strategySynthesis: tryReadDocument(
      io,
      inputPaths.strategySynthesisPath,
      strategySynthesisDocumentSchema,
    ),
    harnessResults: readHarnessResults(io, inputPaths),
  };
}

export function loadExistingResearchCandidateRegistry(
  io: ResearchCandidateRegistryIo,
  path: string,
): ResearchCandidateRegistryReport | null {
  const document = tryReadDocument(io, path, existingRegistrySchema);
  if (!document) {
    return null;
  }

  return document;
}
