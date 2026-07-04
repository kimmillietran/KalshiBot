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

const m91MonthCoverageSchema = z.object({
  month: z.string().trim().min(1),
  marketCount: z.number().finite().optional(),
  tradingDayCount: z.number().finite().optional(),
  coverageStatus: z.enum(["MISSING", "UNDER_COVERED", "COVERED"]).optional(),
});

const m91RecommendationSchema = z.object({
  recommendationId: z.string().trim().min(1).optional(),
  seriesTicker: z.string().trim().min(1),
  startMonth: z.string().trim().min(1),
  endMonth: z.string().trim().min(1),
  missingMonths: z.array(z.string().trim().min(1)).optional(),
  includesMissing: z.boolean().optional(),
  includesUnderCovered: z.boolean().optional(),
  priorityScore: z.number().finite(),
  rationale: z.string().trim().min(1),
  expectedResearchBenefit: z.string().trim().min(1),
  supportingHypothesisIds: z.array(z.string().trim().min(1)).optional(),
});

const m91CoveragePlanSchema = z.object({
  generatedAt: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  snapshot: z
    .object({
      marketCount: z.number().finite().int().nonnegative().optional(),
      uniqueTradingDays: z.number().finite().int().nonnegative().optional(),
      monthCoverage: z.array(m91MonthCoverageSchema).optional(),
      missingMonths: z.array(z.string().trim().min(1)).optional(),
      underCoveredMonths: z.array(z.string().trim().min(1)).optional(),
      depthThresholds: z
        .object({
          minMarketsPerMonth: z.number().finite(),
          minTradingDaysPerMonth: z.number().finite(),
        })
        .optional(),
    })
    .optional(),
  recommendations: z.array(m91RecommendationSchema),
});

function monthToWindowStart(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    return month;
  }

  return new Date(Date.UTC(year, monthIndex - 1, 1)).toISOString();
}

function monthToWindowEnd(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    return month;
  }

  return new Date(Date.UTC(year, monthIndex, 0, 23, 59, 59, 999)).toISOString();
}

function normalizeM91CoveragePlan(
  report: z.infer<typeof m91CoveragePlanSchema>,
): HistoricalCoveragePlan {
  return {
    generatedAt: report.generatedAt,
    outputPath: report.outputPath,
    coverageSnapshot: report.snapshot
      ? {
          currentMarketCount: report.snapshot.marketCount ?? null,
          uniqueTradingDays: report.snapshot.uniqueTradingDays ?? null,
          monthCoverage: (report.snapshot.monthCoverage ?? []).map((entry) => entry.month),
          missingMonths: report.snapshot.missingMonths ?? [],
          coveredWindows: [],
        }
      : undefined,
    recommendations: report.recommendations.map((recommendation) => ({
      priority: recommendation.priorityScore,
      windowStart: monthToWindowStart(recommendation.startMonth),
      windowEnd: monthToWindowEnd(recommendation.endMonth),
      seriesTicker: recommendation.seriesTicker,
      estimatedMarketCount: null,
      expectedResearchBenefit: recommendation.expectedResearchBenefit,
      reason: recommendation.rationale,
    })),
  };
}

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
  const legacy = coveragePlanSchema.safeParse(parsed);
  if (legacy.success) {
    return {
      generatedAt: legacy.data.generatedAt,
      outputPath: legacy.data.outputPath,
      coverageSnapshot: legacy.data.coverageSnapshot
        ? {
            currentMarketCount: legacy.data.coverageSnapshot.currentMarketCount ?? null,
            uniqueTradingDays: legacy.data.coverageSnapshot.uniqueTradingDays ?? null,
            monthCoverage: legacy.data.coverageSnapshot.monthCoverage ?? [],
            missingMonths: legacy.data.coverageSnapshot.missingMonths ?? [],
            coveredWindows: legacy.data.coverageSnapshot.coveredWindows ?? [],
          }
        : undefined,
      recommendations: legacy.data.recommendations.map((recommendation) => ({
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

  const m91 = m91CoveragePlanSchema.safeParse(parsed);
  if (m91.success) {
    return normalizeM91CoveragePlan(m91.data);
  }

  throw new ExpansionConfigError(
    `Invalid historical-coverage-plan.json schema in ${path}: ${legacy.error.message}`,
    ExpansionConfigErrorCode.INVALID_COVERAGE_PLAN,
  );
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
