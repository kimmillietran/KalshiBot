import { z } from "zod";

import { CalibrationErrorCode } from "@/lib/data/research/calibration/calibrationTypes";
import type { ProbabilityCalibrationReport } from "@/lib/data/research/calibration/calibrationTypes";
import type { StrategyLeaderboard } from "@/lib/data/research/leaderboard/strategyLeaderboardTypes";
import { STRATEGY_LEADERBOARD_RANK_METRICS } from "@/lib/data/research/leaderboard/strategyLeaderboardTypes";

import {
  ResearchReportError,
  ResearchReportErrorCode,
} from "./researchReportTypes";

const confidenceIntervalSchema = z
  .object({
    lower: z.number().finite(),
    upper: z.number().finite(),
    pointEstimate: z.number().finite(),
  })
  .nullable();

const leaderboardEntrySchema = z.object({
  rank: z.number().finite().int().positive(),
  strategyId: z.string().trim().min(1),
  marketsTested: z.number().finite().int().nonnegative(),
  completedMarkets: z.number().finite().int().nonnegative(),
  totalTrades: z.number().finite().int().nonnegative(),
  totalFills: z.number().finite().int().nonnegative(),
  totalContractsFilled: z.number().finite().int().nonnegative(),
  totalPnlCents: z.number().finite(),
  averagePnlCents: z.number().finite(),
  medianPnlCents: z.number().finite(),
  winRatePct: z.number().finite().nonnegative(),
  maxDrawdownPct: z.number().finite().nonnegative(),
  sharpeRatio: z.number().finite().nullable(),
  averageDurationMs: z.number().finite().nonnegative(),
  sampleSize: z.number().finite().int().nonnegative().optional(),
  confidenceInterval95: z
    .object({
      meanPnlCents: confidenceIntervalSchema,
      winRatePct: confidenceIntervalSchema,
    })
    .optional(),
  statisticallySignificant: z.boolean().optional(),
  sourcePaths: z.array(z.string().trim().min(1)),
});

const strategyLeaderboardSchema = z.object({
  generatedAt: z.string().trim().min(1),
  inputRoot: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  rankBy: z.enum(STRATEGY_LEADERBOARD_RANK_METRICS),
  strategies: z.array(leaderboardEntrySchema),
});

const calibrationWarningSchema = z.object({
  code: z.enum([
    CalibrationErrorCode.MISSING_SETTLEMENT,
    CalibrationErrorCode.MISSING_PROBABILITY,
  ]),
  message: z.string().trim().min(1),
  marketTicker: z.string().optional(),
});

const calibrationReliabilityRowSchema = z.object({
  binIndex: z.number().finite().int().nonnegative(),
  binLabel: z.string().trim().min(1),
  sampleCount: z.number().finite().int().nonnegative(),
  averagePredictedProbability: z.number().finite().nullable(),
  observedSettlementFrequency: z.number().finite().nullable(),
  calibrationGap: z.number().finite().nullable(),
});

const calibrationChannelSchema = z.object({
  source: z.enum(["kalshi-implied", "strategy-fair-value"]),
  sampleCount: z.number().finite().int().nonnegative(),
  brierScore: z.number().finite().nullable(),
  logLoss: z.number().finite().nullable(),
  calibrationError: z.number().finite().nullable(),
  bins: z.array(
    z.object({
      binIndex: z.number().finite().int().nonnegative(),
      binStart: z.number().finite(),
      binEnd: z.number().finite(),
      sampleCount: z.number().finite().int().nonnegative(),
      averagePredictedProbability: z.number().finite().nullable(),
      observedSettlementFrequency: z.number().finite().nullable(),
    }),
  ),
  reliabilityTable: z.array(calibrationReliabilityRowSchema),
});

const calibrationReportSchema = z.object({
  generatedAt: z.string().trim().min(1),
  strategyId: z.string().trim().min(1),
  seriesTicker: z.string().trim().min(1),
  inputRoot: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  sampleCounts: z.object({
    totalObservations: z.number().finite().int().nonnegative(),
    marketCount: z.number().finite().int().nonnegative(),
    kalshiImpliedCount: z.number().finite().int().nonnegative(),
    strategyFairValueCount: z.number().finite().int().nonnegative(),
    skippedMissingSettlement: z.number().finite().int().nonnegative(),
    skippedMissingProbability: z.number().finite().int().nonnegative(),
  }),
  kalshiImplied: calibrationChannelSchema,
  strategyFairValue: calibrationChannelSchema.nullable(),
  markets: z.array(
    z.object({
      marketTicker: z.string().trim().min(1),
      outputPath: z.string().trim().min(1),
      settlementOutcome: z.union([z.literal(0), z.literal(1)]).nullable(),
      kalshiImpliedSampleCount: z.number().finite().int().nonnegative(),
      strategyFairValueSampleCount: z.number().finite().int().nonnegative(),
      warnings: z.array(calibrationWarningSchema),
    }),
  ),
  warnings: z.array(calibrationWarningSchema),
});

function parseJsonDocument<T>(
  json: string,
  label: string,
  schema: z.ZodType<T>,
): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ResearchReportError(
      `${label} contains invalid JSON`,
      ResearchReportErrorCode.INVALID_JSON,
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ResearchReportError(
      issue?.message ?? `${label} failed validation`,
      ResearchReportErrorCode.INVALID_DOCUMENT,
    );
  }

  return result.data;
}

/** Parses a serialized strategy leaderboard JSON document. */
export function parseStrategyLeaderboardJson(json: string): StrategyLeaderboard {
  const parsed = parseJsonDocument(
    json,
    "strategy-leaderboard.json",
    strategyLeaderboardSchema,
  );

  return {
    ...parsed,
    strategies: parsed.strategies.map((entry) => ({
      ...entry,
      sampleSize: entry.sampleSize ?? entry.completedMarkets,
      confidenceInterval95: entry.confidenceInterval95 ?? {
        meanPnlCents: null,
        winRatePct: null,
      },
      statisticallySignificant: entry.statisticallySignificant ?? false,
    })),
  };
}

/** Parses a serialized calibration report JSON document. */
export function parseCalibrationReportJson(json: string): ProbabilityCalibrationReport {
  return parseJsonDocument(json, "calibration-report.json", calibrationReportSchema);
}
