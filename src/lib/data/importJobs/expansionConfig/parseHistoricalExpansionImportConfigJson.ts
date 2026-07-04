import { z } from "zod";

import {
  ExpansionConfigError,
  ExpansionConfigErrorCode,
  type HistoricalExpansionImportConfig,
} from "./expansionConfigTypes";

const expansionImportJobSchema = z.object({
  jobId: z.string().trim().min(1),
  priority: z.number().finite(),
  status: z.enum(["scheduled", "skipped"]),
  seriesTicker: z.string().trim().min(1),
  windowStart: z.string().trim().min(1),
  windowEnd: z.string().trim().min(1),
  estimatedMarketCount: z.number().finite().nullable().optional(),
  reason: z.string().nullable().optional(),
  expectedResearchBenefit: z.string().nullable().optional(),
  skipReason: z.string().nullable().optional(),
  discovery: z.object({
    seriesTicker: z.string().trim().min(1),
    sampling: z.object({
      afterDate: z.string().trim().min(1),
      beforeDate: z.string().trim().min(1),
    }),
  }),
  importDefaults: z.object({
    kalshi: z.object({
      marketSource: z.string().trim().min(1),
      candleSource: z.string().trim().min(1),
      settlementSource: z.string().trim().min(1),
    }),
    btc: z.object({
      provider: z.string().trim().min(1),
      symbol: z.string().trim().min(1),
      interval: z.string().trim().min(1),
    }),
    output: z.object({
      format: z.string().trim().min(1),
      includeValidationReport: z.boolean(),
      includeFixture: z.boolean(),
    }),
  }),
});

const expansionImportConfigSchema = z.object({
  generatedAt: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  inputPath: z.string().trim().min(1),
  dryRun: z.boolean(),
  importConfigsDir: z.string().trim().min(1),
  summary: z.object({
    recommendationCount: z.number().finite().int().nonnegative(),
    scheduledJobCount: z.number().finite().int().nonnegative(),
    skippedJobCount: z.number().finite().int().nonnegative(),
  }),
  jobs: z.array(expansionImportJobSchema),
});

const COVERAGE_PLAN_MARKERS = [
  "recommendations",
  "snapshot",
  "plannerNotes",
  "htmlOutputPath",
  "inputStatus",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rejects coverage-plan-shaped JSON before it can be written as expansion config. */
export function assertExpansionConfigNotCoveragePlan(
  value: unknown,
  path: string,
): void {
  if (!isRecord(value)) {
    return;
  }

  const markers = COVERAGE_PLAN_MARKERS.filter((key) => key in value);
  if (markers.length > 0) {
    throw new ExpansionConfigError(
      `Refusing to write coverage plan schema to ${path} (found: ${markers.join(", ")})`,
      ExpansionConfigErrorCode.COVERAGE_PLAN_OUTPUT_REJECTED,
    );
  }
}

/** Parses and validates a historical expansion import config document. */
export function parseHistoricalExpansionImportConfigJson(
  path: string,
  json: string,
): HistoricalExpansionImportConfig {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ExpansionConfigError(
      `Invalid JSON in historical expansion import config: ${path}`,
      ExpansionConfigErrorCode.INVALID_EXPANSION_CONFIG_OUTPUT,
    );
  }

  assertExpansionConfigNotCoveragePlan(parsed, path);

  const result = expansionImportConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ExpansionConfigError(
      `Invalid historical expansion import config schema in ${path}: ${result.error.message}`,
      ExpansionConfigErrorCode.INVALID_EXPANSION_CONFIG_OUTPUT,
    );
  }

  return result.data as unknown as HistoricalExpansionImportConfig;
}
