import { z } from "zod";

import {
  StrategyHarnessError,
  SYNTHESIZED_PROMOTION_STATUSES,
  SYNTHESIZED_STRATEGY_DIRECTIONS,
  type StrategyHarnessIo,
  type StrategySynthesisCandidatesReport,
  type SynthesizedStrategySpec,
} from "./strategyHarnessTypes";

const entryConditionsSchema = z.object({
  yesMidThresholdCents: z.number().finite().int().min(1).max(99),
  minCalibrationError: z.number().finite().optional(),
  probabilityBucketId: z.string().trim().min(1).optional(),
});

const validationSummarySchema = z.object({
  robustnessScore: z.number().finite().nullable(),
  passes: z.boolean(),
  observationCount: z.number().finite().int().nonnegative().nullable(),
});

const synthesizedStrategySpecSchema = z.object({
  strategyId: z.string().trim().min(1),
  hypothesisId: z.string().trim().min(1),
  strategyFamily: z.string().trim().min(1),
  direction: z.enum(SYNTHESIZED_STRATEGY_DIRECTIONS),
  entryConditions: entryConditionsSchema,
  exitAssumption: z.string().trim().min(1),
  requiredData: z.array(z.string().trim().min(1)),
  riskNotes: z.array(z.string().trim().min(1)),
  validationSummary: validationSummarySchema,
  promotionStatus: z.enum(SYNTHESIZED_PROMOTION_STATUSES),
});

const strategySynthesisCandidatesReportSchema = z.object({
  generatedAt: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  inputs: z.record(z.string(), z.unknown()),
  strategies: z.array(synthesizedStrategySpecSchema),
  summary: z.record(z.string(), z.unknown()),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new StrategyHarnessError(`Invalid JSON in ${path}`);
  }
}

export function loadStrategySynthesisCandidatesReport(
  io: StrategyHarnessIo,
  path: string,
): StrategySynthesisCandidatesReport {
  if (!io.fileExists(path)) {
    throw new StrategyHarnessError(`Missing strategy synthesis file: ${path}`);
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = strategySynthesisCandidatesReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new StrategyHarnessError(
      `Invalid strategy-synthesis-candidates.json schema in ${path}: ${result.error.message}`,
    );
  }

  return result.data;
}

export function filterHarnessStrategySpecs(
  strategies: readonly SynthesizedStrategySpec[],
  options?: {
    strategyFamily?: string;
    synthesizedStrategyId?: string;
    includeRejected?: boolean;
  },
): SynthesizedStrategySpec[] {
  return [...strategies]
    .filter((spec) => {
      if (options?.strategyFamily && spec.strategyFamily !== options.strategyFamily) {
        return false;
      }

      if (
        options?.synthesizedStrategyId
        && spec.strategyId !== options.synthesizedStrategyId
      ) {
        return false;
      }

      if (!options?.includeRejected && spec.promotionStatus === "rejected") {
        return false;
      }

      return true;
    })
    .sort((left, right) => left.strategyId.localeCompare(right.strategyId));
}
