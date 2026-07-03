import { z } from "zod";

import { inspectResearchOutputDocument } from "@/lib/data/research/inspect/parseResearchOutputInspection";

import {
  CandidatePromotionError,
  type CandidatePromotionInputPaths,
  type CandidatePromotionIo,
  type ParsedCandidatePromotionInputs,
  type ParsedHarnessStrategyMetrics,
  type ParsedSynthesisStrategy,
  type ParsedValidationEntry,
} from "./candidatePromotionTypes";

const validationEntrySchema = z.object({
  hypothesisId: z.string().trim().min(1),
  robustnessScore: z.number().finite(),
  passes: z.boolean(),
  reasons: z.array(z.string()),
  observationCount: z.number().int().nonnegative(),
  sampleConcentration: z.object({
    singleDayDominated: z.boolean(),
    largestDayPercent: z.number().finite(),
  }),
});

const validationDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  validations: z.array(validationEntrySchema),
});

const synthesisStrategySchema = z.object({
  strategyId: z.string().trim().min(1),
  hypothesisId: z.string().trim().min(1),
  strategyFamily: z.string().trim().min(1),
  promotionStatus: z.enum(["experimental", "candidate", "rejected"]),
  validationSummary: z.object({
    robustnessScore: z.number().finite().nullable(),
    passes: z.boolean(),
    observationCount: z.number().int().nonnegative().nullable(),
  }),
  riskNotes: z.array(z.string()),
});

const synthesisDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  strategies: z.array(synthesisStrategySchema),
});

const harnessStrategyMetricsSchema = z.object({
  strategyId: z.string().trim().min(1),
  hypothesisId: z.string().trim().min(1),
  strategyFamily: z.string().trim().min(1),
  marketRuns: z.number().int().nonnegative(),
  successfulRuns: z.number().int().nonnegative(),
  failedRuns: z.number().int().nonnegative(),
  skippedRuns: z.number().int().nonnegative(),
  totalTradeCount: z.number().int().nonnegative(),
  netPnlCents: z.number().finite().nullable(),
  warnings: z.array(z.string()),
});

const harnessResultsDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  strategies: z.array(harnessStrategyMetricsSchema),
});

const harnessResultsM815CStrategySchema = z.object({
  strategyId: z.string().trim().min(1),
  hypothesisId: z.string().trim().min(1),
  strategyFamily: z.string().trim().min(1),
  harnessRuns: z.object({
    total: z.number().int().nonnegative(),
    successful: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  tradeCount: z.number().int().nonnegative(),
  totalPnlCents: z.number().finite(),
  warnings: z.array(z.string()).default([]),
});

const harnessResultsM815CDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  strategies: z.array(harnessResultsM815CStrategySchema),
});

const harnessSummaryResultSchema = z.object({
  synthesizedStrategyId: z.string().trim().min(1),
  hypothesisId: z.string().trim().min(1),
  strategyFamily: z.string().trim().min(1),
  status: z.enum(["success", "failed", "skipped"]),
  outputPath: z.string().trim().min(1).optional(),
  errorMessage: z.string().nullable(),
});

const harnessSummaryDocumentSchema = z.object({
  completedAt: z.string().trim().min(1),
  results: z.array(harnessSummaryResultSchema),
});

const significanceStrategySchema = z.object({
  strategyId: z.string().trim().min(1),
  statisticallySignificant: z.boolean(),
  meanPnlPValueOneTailed: z.number().finite().nullable(),
  insufficientSample: z.boolean(),
});

const significanceDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  strategies: z.array(significanceStrategySchema),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new CandidatePromotionError(`Invalid JSON in ${path}`);
  }
}

function parseDocument<T>(path: string, json: string, schema: z.ZodType<T>): T {
  const parsed = parseJson(path, json);
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new CandidatePromotionError(
      `Invalid document schema in ${path}: ${result.error.message}`,
    );
  }
  return result.data;
}

function readRequiredDocument<T>(
  io: CandidatePromotionIo,
  path: string,
  schema: z.ZodType<T>,
  label: string,
): T {
  if (!io.fileExists(path)) {
    throw new CandidatePromotionError(`Missing required ${label}: ${path}`);
  }

  return parseDocument(path, io.readFile(path), schema);
}

function readOptionalDocument<T>(
  io: CandidatePromotionIo,
  path: string,
  schema: z.ZodType<T>,
): T | null {
  if (!io.fileExists(path)) {
    return null;
  }

  return parseDocument(path, io.readFile(path), schema);
}

function aggregateHarnessResults(
  results: readonly z.infer<typeof harnessSummaryResultSchema>[],
  io: CandidatePromotionIo,
): ParsedHarnessStrategyMetrics[] {
  const grouped = new Map<string, {
    strategyId: string;
    hypothesisId: string;
    strategyFamily: string;
    marketRuns: number;
    successfulRuns: number;
    failedRuns: number;
    skippedRuns: number;
    totalTradeCount: number;
    netPnlCents: number;
    warnings: string[];
  }>();

  for (const result of results) {
    const bucket = grouped.get(result.synthesizedStrategyId) ?? {
      strategyId: result.synthesizedStrategyId,
      hypothesisId: result.hypothesisId,
      strategyFamily: result.strategyFamily,
      marketRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      skippedRuns: 0,
      totalTradeCount: 0,
      netPnlCents: 0,
      warnings: [],
    };

    bucket.marketRuns += 1;

    if (result.status === "success") {
      bucket.successfulRuns += 1;
      if (result.outputPath && io.fileExists(result.outputPath)) {
        const inspection = inspectResearchOutputDocument(
          io.readFile(result.outputPath),
          { inputPath: result.outputPath },
        );
        bucket.totalTradeCount += inspection.tradeCount ?? 0;
        if (inspection.netPnlCents !== null) {
          bucket.netPnlCents += inspection.netPnlCents;
        }
        bucket.warnings.push(...inspection.diagnosticsWarnings);
      }
    } else if (result.status === "failed") {
      bucket.failedRuns += 1;
      if (result.errorMessage) {
        bucket.warnings.push(result.errorMessage);
      }
    } else {
      bucket.skippedRuns += 1;
    }

    grouped.set(result.synthesizedStrategyId, bucket);
  }

  return [...grouped.values()]
    .sort((left, right) => left.strategyId.localeCompare(right.strategyId))
    .map((entry) => ({
      strategyId: entry.strategyId,
      hypothesisId: entry.hypothesisId,
      strategyFamily: entry.strategyFamily,
      marketRuns: entry.marketRuns,
      successfulRuns: entry.successfulRuns,
      failedRuns: entry.failedRuns,
      skippedRuns: entry.skippedRuns,
      totalTradeCount: entry.totalTradeCount,
      netPnlCents: entry.successfulRuns > 0 ? entry.netPnlCents : null,
      warnings: [...new Set(entry.warnings)],
    }));
}

function normalizeM815CHarnessStrategy(
  strategy: z.infer<typeof harnessResultsM815CStrategySchema>,
): ParsedHarnessStrategyMetrics {
  return {
    strategyId: strategy.strategyId,
    hypothesisId: strategy.hypothesisId,
    strategyFamily: strategy.strategyFamily,
    marketRuns: strategy.harnessRuns.total,
    successfulRuns: strategy.harnessRuns.successful,
    failedRuns: strategy.harnessRuns.failed,
    skippedRuns: strategy.harnessRuns.skipped,
    totalTradeCount: strategy.tradeCount,
    netPnlCents:
      strategy.harnessRuns.successful > 0 ? strategy.totalPnlCents : null,
    warnings: strategy.warnings,
  };
}

function parseHarnessResultsStrategies(
  path: string,
  json: string,
): ParsedHarnessStrategyMetrics[] | null {
  const parsed = parseJson(path, json);
  const metrics = harnessResultsDocumentSchema.safeParse(parsed);
  if (metrics.success) {
    return metrics.data.strategies;
  }

  const m815c = harnessResultsM815CDocumentSchema.safeParse(parsed);
  if (m815c.success) {
    return m815c.data.strategies.map(normalizeM815CHarnessStrategy);
  }

  return null;
}

function loadHarnessStrategies(
  io: CandidatePromotionIo,
  inputPaths: CandidatePromotionInputPaths,
): readonly ParsedHarnessStrategyMetrics[] {
  if (io.fileExists(inputPaths.harnessResultsPath)) {
    const strategies = parseHarnessResultsStrategies(
      inputPaths.harnessResultsPath,
      io.readFile(inputPaths.harnessResultsPath),
    );
    if (strategies) {
      return strategies;
    }
  }

  const harnessSummary = readOptionalDocument(
    io,
    inputPaths.harnessSummaryFallbackPath,
    harnessSummaryDocumentSchema,
  );

  if (!harnessSummary) {
    return [];
  }

  return aggregateHarnessResults(harnessSummary.results, io);
}

function loadSignificanceByFamily(
  io: CandidatePromotionIo,
  path: string,
): ParsedCandidatePromotionInputs["significanceByFamily"] {
  const document = readOptionalDocument(io, path, significanceDocumentSchema);
  const map = new Map<
    string,
    { statisticallySignificant: boolean; pValue: number | null; insufficientSample: boolean }
  >();

  if (!document) {
    return map;
  }

  for (const strategy of document.strategies) {
    map.set(strategy.strategyId, {
      statisticallySignificant: strategy.statisticallySignificant,
      pValue: strategy.meanPnlPValueOneTailed,
      insufficientSample: strategy.insufficientSample,
    });
  }

  return map;
}

/** Loads candidate promotion inputs from existing research artifacts. */
export function loadCandidatePromotionInputs(
  io: CandidatePromotionIo,
  inputPaths: CandidatePromotionInputPaths,
): ParsedCandidatePromotionInputs {
  const validation = readRequiredDocument(
    io,
    inputPaths.hypothesisValidationPath,
    validationDocumentSchema,
    "hypothesis validation report",
  );

  const synthesis = readRequiredDocument(
    io,
    inputPaths.strategySynthesisPath,
    synthesisDocumentSchema,
    "strategy synthesis report",
  );

  return {
    validation,
    synthesis,
    harnessStrategies: loadHarnessStrategies(io, inputPaths),
    significanceByFamily: loadSignificanceByFamily(
      io,
      inputPaths.statisticalSignificancePath,
    ),
  };
}

export function indexValidationEntries(
  validations: readonly ParsedValidationEntry[],
): Map<string, ParsedValidationEntry> {
  return new Map(validations.map((entry) => [entry.hypothesisId, entry]));
}

export function indexHarnessStrategies(
  strategies: readonly ParsedHarnessStrategyMetrics[],
): Map<string, ParsedHarnessStrategyMetrics> {
  return new Map(strategies.map((entry) => [entry.strategyId, entry]));
}

export function sortSynthesisStrategies(
  strategies: readonly ParsedSynthesisStrategy[],
): ParsedSynthesisStrategy[] {
  return [...strategies].sort((left, right) =>
    left.strategyId.localeCompare(right.strategyId),
  );
}
