import { z } from "zod";

import {
  StrategyHarnessError,
  SYNTHESIZED_PROMOTION_STATUSES,
  SYNTHESIZED_STRATEGY_DIRECTIONS,
  SUPPORTED_STRATEGY_HARNESS_FAMILIES,
  type StrategySynthesisCandidatesReport,
  type SynthesizedStrategyEntryConditions,
  type SynthesizedStrategySpec,
  type SupportedStrategyHarnessFamily,
} from "./strategyHarnessTypes";

const CALIBRATION_FADE_FAMILY_ALIASES = new Set([
  "calibration-fade",
  "calibration-no-fade",
  "calibration-yes-fade",
]);

const rawEntryConditionsSchema = z
  .object({
    yesMidThresholdCents: z.number().finite().int().min(1).max(99).optional(),
    minCalibrationError: z.number().finite().nullable().optional(),
    probabilityBucketId: z.string().trim().min(1).optional(),
    bucketId: z.string().trim().min(1).nullable().optional(),
    marketCondition: z.string().trim().min(1).optional(),
    summary: z.string().optional(),
    atlasGroupId: z.string().nullable().optional(),
    calibrationDirection: z.string().nullable().optional(),
    leadLagCandles: z.number().nullable().optional(),
  })
  .passthrough();

const rawValidationSummarySchema = z
  .object({
    robustnessScore: z.number().finite().nullable(),
    passes: z.boolean(),
    observationCount: z.number().finite().int().nonnegative().nullable(),
    reasons: z.array(z.string()).optional(),
    summary: z.string().optional(),
  })
  .passthrough();

const rawStrategySchema = z
  .object({
    strategyId: z.string().trim().min(1),
    hypothesisId: z.string().trim().min(1),
    strategyFamily: z.string().trim().min(1),
    direction: z.enum(SYNTHESIZED_STRATEGY_DIRECTIONS),
    entryConditions: rawEntryConditionsSchema,
    exitAssumption: z.string().trim().min(1),
    requiredData: z.array(z.string().trim().min(1)),
    riskNotes: z.array(z.string().trim().min(1)),
    validationSummary: rawValidationSummarySchema,
    promotionStatus: z.enum(SYNTHESIZED_PROMOTION_STATUSES),
  })
  .passthrough();

const rawReportSchema = z
  .object({
    generatedAt: z.string().trim().min(1),
    outputPath: z.string().trim().min(1),
    inputs: z.record(z.string(), z.unknown()).optional(),
    inputPaths: z.record(z.string(), z.unknown()).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    strategies: z.array(rawStrategySchema),
    summary: z.record(z.string(), z.unknown()),
  })
  .passthrough();

function parseProbabilityRange(
  marketCondition: string,
): { lower: number; upper: number } | null {
  const match = marketCondition.match(/\[(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\]/);
  if (!match) {
    return null;
  }

  const lower = Number.parseFloat(match[1] ?? "");
  const upper = Number.parseFloat(match[2] ?? "");
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    return null;
  }

  return { lower, upper };
}

export function deriveYesMidThresholdCents(input: {
  direction: SynthesizedStrategySpec["direction"];
  entryConditions: z.infer<typeof rawEntryConditionsSchema>;
}): number {
  if (typeof input.entryConditions.yesMidThresholdCents === "number") {
    return input.entryConditions.yesMidThresholdCents;
  }

  const marketCondition = input.entryConditions.marketCondition;
  if (marketCondition) {
    const range = parseProbabilityRange(marketCondition);
    if (range) {
      const buyNo = input.direction === "fade-yes" || input.direction === "buy-no";
      const probability = buyNo ? range.lower : range.upper;
      return Math.max(1, Math.min(99, Math.round(probability * 100)));
    }
  }

  throw new StrategyHarnessError(
    `Strategy entry conditions for "${input.entryConditions.summary ?? "unknown"}" are missing yesMidThresholdCents and no derivable probability range in marketCondition`,
  );
}

export function normalizeHarnessStrategyFamily(
  strategyFamily: string,
): SupportedStrategyHarnessFamily | null {
  if (
    SUPPORTED_STRATEGY_HARNESS_FAMILIES.includes(
      strategyFamily as SupportedStrategyHarnessFamily,
    )
  ) {
    return strategyFamily as SupportedStrategyHarnessFamily;
  }

  if (CALIBRATION_FADE_FAMILY_ALIASES.has(strategyFamily)) {
    return "calibration-fade";
  }

  return null;
}

function normalizeEntryConditions(
  direction: SynthesizedStrategySpec["direction"],
  entryConditions: z.infer<typeof rawEntryConditionsSchema>,
): SynthesizedStrategyEntryConditions {
  const yesMidThresholdCents = deriveYesMidThresholdCents({
    direction,
    entryConditions,
  });

  return {
    yesMidThresholdCents,
    ...(typeof entryConditions.minCalibrationError === "number"
      ? { minCalibrationError: entryConditions.minCalibrationError }
      : {}),
    ...(entryConditions.probabilityBucketId
      ? { probabilityBucketId: entryConditions.probabilityBucketId }
      : entryConditions.bucketId
        ? { probabilityBucketId: entryConditions.bucketId }
        : {}),
  };
}

export function normalizeSynthesizedStrategySpec(
  raw: z.infer<typeof rawStrategySchema>,
): SynthesizedStrategySpec {
  const strategyFamily = normalizeHarnessStrategyFamily(raw.strategyFamily);
  if (!strategyFamily) {
    throw new StrategyHarnessError(
      `Unsupported strategy family "${raw.strategyFamily}". Supported families: ${SUPPORTED_STRATEGY_HARNESS_FAMILIES.join(", ")}`,
    );
  }

  return {
    strategyId: raw.strategyId,
    hypothesisId: raw.hypothesisId,
    strategyFamily,
    direction: raw.direction,
    entryConditions: normalizeEntryConditions(raw.direction, raw.entryConditions),
    exitAssumption: raw.exitAssumption,
    requiredData: raw.requiredData,
    riskNotes: raw.riskNotes,
    validationSummary: {
      robustnessScore: raw.validationSummary.robustnessScore,
      passes: raw.validationSummary.passes,
      observationCount: raw.validationSummary.observationCount,
    },
    promotionStatus: raw.promotionStatus,
  };
}

export type RawSynthesizedStrategySpec = z.infer<typeof rawStrategySchema>;

export type RawStrategySynthesisCandidatesReport = {
  generatedAt: string;
  outputPath: string;
  inputs: Record<string, unknown>;
  strategies: readonly RawSynthesizedStrategySpec[];
  summary: Record<string, unknown>;
};

function parseRawStrategySynthesisReport(
  path: string,
  parsed: unknown,
): RawStrategySynthesisCandidatesReport {
  const result = rawReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new StrategyHarnessError(
      `Invalid strategy-synthesis-candidates.json schema in ${path}: ${result.error.message}`,
    );
  }

  const inputs =
    result.data.inputs
    ?? {
      ...(result.data.inputPaths ?? {}),
      ...(result.data.config ? { config: result.data.config } : {}),
    };

  return {
    generatedAt: result.data.generatedAt,
    outputPath: result.data.outputPath,
    inputs,
    strategies: result.data.strategies,
    summary: result.data.summary,
  };
}

export function parseRawStrategySynthesisCandidatesReport(
  path: string,
  parsed: unknown,
): RawStrategySynthesisCandidatesReport {
  return parseRawStrategySynthesisReport(path, parsed);
}

export function parseStrategySynthesisCandidatesReport(
  path: string,
  parsed: unknown,
): StrategySynthesisCandidatesReport {
  const rawReport = parseRawStrategySynthesisReport(path, parsed);

  return {
    generatedAt: rawReport.generatedAt,
    outputPath: rawReport.outputPath,
    inputs: rawReport.inputs,
    strategies: rawReport.strategies.map(normalizeSynthesizedStrategySpec),
    summary: rawReport.summary,
  };
}
