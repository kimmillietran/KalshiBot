import { z } from "zod";

import {
  ExpansionConfigError,
  ExpansionConfigErrorCode,
  type HistoricalCoveragePlan,
} from "./expansionConfigTypes";

const coverageWindowSchema = z.object({
  windowStart: z.string().trim().min(1),
  windowEnd: z.string().trim().min(1),
});

const recommendationSchema = coverageWindowSchema.extend({
  priority: z.number().finite(),
  seriesTicker: z.string().trim().min(1).optional(),
  estimatedMarketCount: z.number().finite().int().nonnegative().nullable().optional(),
  expectedResearchBenefit: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
});

const coveragePlanSchema = z.object({
  generatedAt: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  coverageSnapshot: z
    .object({
      currentMarketCount: z.number().finite().int().nonnegative().nullable().optional(),
      uniqueTradingDays: z.number().finite().int().nonnegative().nullable().optional(),
      monthCoverage: z.array(z.string().trim().min(1)).optional(),
      missingMonths: z.array(z.string().trim().min(1)).optional(),
      coveredWindows: z.array(coverageWindowSchema).optional(),
    })
    .optional(),
  recommendations: z.array(recommendationSchema),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new ExpansionConfigError(
      `Invalid JSON in historical coverage plan: ${path}`,
      ExpansionConfigErrorCode.INVALID_COVERAGE_PLAN_JSON,
    );
  }
}

/** Parses M9.1 historical coverage plan JSON. */
export function parseHistoricalCoveragePlanJson(
  path: string,
  json: string,
): HistoricalCoveragePlan {
  const parsed = parseJson(path, json);
  const result = coveragePlanSchema.safeParse(parsed);
  if (!result.success) {
    throw new ExpansionConfigError(
      `Invalid historical-coverage-plan.json schema in ${path}: ${result.error.message}`,
      ExpansionConfigErrorCode.INVALID_COVERAGE_PLAN,
    );
  }

  return {
    generatedAt: result.data.generatedAt,
    outputPath: result.data.outputPath,
    coverageSnapshot: result.data.coverageSnapshot
      ? {
          currentMarketCount: result.data.coverageSnapshot.currentMarketCount ?? null,
          uniqueTradingDays: result.data.coverageSnapshot.uniqueTradingDays ?? null,
          monthCoverage: result.data.coverageSnapshot.monthCoverage ?? [],
          missingMonths: result.data.coverageSnapshot.missingMonths ?? [],
          coveredWindows: result.data.coverageSnapshot.coveredWindows ?? [],
        }
      : undefined,
    recommendations: result.data.recommendations.map((recommendation) => ({
      priority: recommendation.priority,
      windowStart: recommendation.windowStart,
      windowEnd: recommendation.windowEnd,
      seriesTicker: recommendation.seriesTicker,
      estimatedMarketCount: recommendation.estimatedMarketCount ?? null,
      expectedResearchBenefit: recommendation.expectedResearchBenefit ?? null,
      reason: recommendation.reason ?? null,
    })),
  };
}

export function loadHistoricalCoveragePlan(
  readFile: (path: string) => string,
  fileExists: (path: string) => boolean,
  path: string,
): HistoricalCoveragePlan {
  if (!fileExists(path)) {
    throw new ExpansionConfigError(
      `Missing historical coverage plan: ${path}`,
      ExpansionConfigErrorCode.MISSING_COVERAGE_PLAN,
    );
  }

  return parseHistoricalCoveragePlanJson(path, readFile(path));
}
