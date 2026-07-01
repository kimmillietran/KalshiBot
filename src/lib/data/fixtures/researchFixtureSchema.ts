import { z } from "zod";

import { rawHistoricalRecordSchema } from "@/lib/data/schemas";
import { BUILTIN_STRATEGY_IDS } from "@/lib/data/strategies";
import type { RawHistoricalRecord } from "@/lib/data/types";
import type { EngineConfig } from "@/types/domain/trading";

const liquidityQualitySchema = z.enum(["Poor", "Fair", "Good", "Excellent"]);

const engineConfigSchema = z.object({
  enabled: z.boolean(),
  minEdgePercent: z.number().finite(),
  minLiquidityQuality: liquidityQualitySchema,
  maxSpreadPercent: z.number().finite(),
  minimumTimeRemaining: z.number().finite(),
  minimumCandles: z.number().finite().int().nonnegative(),
  bankrollDollars: z.number().finite().positive().optional(),
  kellyFraction: z.number().finite().positive().optional(),
  maxPositionFraction: z.number().finite().positive().optional(),
});

const fillConfigSchema = z.object({
  feeCentsPerContract: z.number().finite().nonnegative(),
  allowPartialFills: z.literal(false),
  priceSource: z.literal("engine-input-pricing"),
});

const metricsConfigSchema = z.object({
  periodsPerYear: z.number().finite().positive().optional(),
  riskFreeRatePerPeriod: z.number().finite().optional(),
});

const exportConfigSchema = z.object({
  exportId: z.string().trim().min(1).optional(),
  generated: z
    .object({
      generatedAt: z.string().trim().min(1),
      generatedBy: z.string().trim().min(1).optional(),
      label: z.string().trim().min(1).optional(),
    })
    .optional(),
});

/** Zod schema for replay-ready research fixture JSON on disk. */
export const historicalResearchCliInputSchema = z.object({
  runId: z.string().trim().min(1, "runId is required"),
  durationMs: z.number().finite().nonnegative(),
  initialCashCents: z.number().finite().nonnegative(),
  bronzeRecords: z
    .array(rawHistoricalRecordSchema)
    .min(1, "At least one bronze record is required"),
  strategyId: z.enum(BUILTIN_STRATEGY_IDS),
  engineConfig: engineConfigSchema,
  fillConfig: fillConfigSchema.optional(),
  metricsConfig: metricsConfigSchema.optional(),
  exportConfig: exportConfigSchema.optional(),
  exportId: z.string().trim().min(1, "exportId must be non-empty").optional(),
  generatedAt: z
    .string()
    .trim()
    .min(1, "generatedAt must be non-empty")
    .optional(),
  generatedBy: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1).optional(),
});

export type HistoricalResearchCliInputDocument = z.infer<
  typeof historicalResearchCliInputSchema
> & {
  engineConfig: EngineConfig;
  bronzeRecords: RawHistoricalRecord[];
};
