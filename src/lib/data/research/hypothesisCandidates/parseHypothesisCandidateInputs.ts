import { z } from "zod";

import type { LeadLagAnalysis } from "@/lib/data/research/leadLag/leadLagTypes";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type { StrategyLeaderboard } from "@/lib/data/research/leaderboard/strategyLeaderboardTypes";
import { STRATEGY_LEADERBOARD_RANK_METRICS } from "@/lib/data/research/leaderboard/strategyLeaderboardTypes";
import type { StatisticalSignificanceReport } from "@/lib/data/research/statisticalSignificance/statisticalSignificanceTypes";

import {
  DEFAULT_LEAD_LAG_INPUT_PATH,
  DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
  DEFAULT_REGIME_TAGS_INPUT_PATH,
  DEFAULT_STATISTICAL_SIGNIFICANCE_INPUT_PATH,
  DEFAULT_STRATEGY_LEADERBOARD_INPUT_PATH,
  HypothesisCandidateError,
  HypothesisCandidateErrorCode,
} from "./hypothesisCandidateTypes";
import type {
  HypothesisCandidateInputStatus,
  HypothesisCandidateIo,
  ParsedHypothesisCandidateInputs,
  RegimeTagsDocument,
} from "./hypothesisCandidateTypes";

const mispricingBucketSchema = z.object({
  bucketId: z.string().trim().min(1),
  bucketLabel: z.string().trim().min(1),
  observations: z.number().finite().int().nonnegative(),
  averageImpliedProbability: z.number().finite().nullable(),
  realizedFrequency: z.number().finite().nullable(),
  calibrationError: z.number().finite().nullable(),
  brierScore: z.number().finite().nullable(),
  averageAbsoluteError: z.number().finite().nullable(),
});

const mispricingAtlasSchema = z.object({
  generatedAt: z.string().trim().min(1),
  inputRoot: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  sampleCounts: z.object({
    totalObservations: z.number().finite().int().nonnegative(),
    marketCount: z.number().finite().int().nonnegative(),
    skippedMissingSettlement: z.number().finite().int().nonnegative(),
    skippedMissingProbability: z.number().finite().int().nonnegative(),
    skippedMissingContext: z.number().finite().int().nonnegative(),
  }),
  overallCalibration: mispricingBucketSchema,
  probabilityBuckets: z.array(mispricingBucketSchema),
  timeRemainingBuckets: z.array(mispricingBucketSchema),
  moneynessBuckets: z.array(mispricingBucketSchema),
  volatilityBuckets: z.array(mispricingBucketSchema),
  warnings: z.array(
    z.object({
      code: z.enum(["missing-settlement", "missing-probability", "missing-context"]),
      message: z.string().trim().min(1),
      marketTicker: z.string().optional(),
    }),
  ),
});

const leadLagLagMetricsSchema = z.object({
  lag: z.number().finite().int(),
  correlation: z.number().finite().nullable(),
  crossCorrelation: z.number().finite().nullable(),
  direction: z.enum(["btc-leads-kalshi", "synchronous", "insufficient-data"]),
  observationCount: z.number().finite().int().nonnegative(),
});

const leadLagAnalysisSchema = z.object({
  generatedAt: z.string().trim().min(1),
  inputRoot: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  maxLag: z.number().finite().int().nonnegative(),
  sampleCounts: z.object({
    marketCount: z.number().finite().int().nonnegative(),
    totalCandles: z.number().finite().int().nonnegative(),
    skippedMarkets: z.number().finite().int().nonnegative(),
    skippedMissingCandles: z.number().finite().int().nonnegative(),
  }),
  aggregateLagMetrics: z.array(leadLagLagMetricsSchema),
  markets: z.array(
    z.object({
      strategyId: z.string().trim().min(1),
      seriesTicker: z.string().trim().min(1),
      marketTicker: z.string().trim().min(1),
      outputPath: z.string().trim().min(1),
      candleCount: z.number().finite().int().nonnegative(),
      skippedMissingCandles: z.number().finite().int().nonnegative(),
      lagMetrics: z.array(leadLagLagMetricsSchema),
      bestLag: z.number().finite().int().nullable(),
      bestDirection: z.enum(["btc-leads-kalshi", "synchronous", "insufficient-data"]),
    }),
  ),
  warnings: z.array(
    z.object({
      code: z.string().trim().min(1),
      message: z.string().trim().min(1),
      marketTicker: z.string().optional(),
    }),
  ),
});

const confidenceIntervalSchema = z
  .object({
    lower: z.number().finite(),
    upper: z.number().finite(),
    pointEstimate: z.number().finite(),
  })
  .nullable();

const statisticalSignificanceSchema = z.object({
  generatedAt: z.string().trim().min(1),
  inputRoot: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  config: z.object({
    seed: z.number().finite(),
    simulationCount: z.number().finite().int().positive(),
    confidenceLevel: z.number().finite(),
    significanceAlpha: z.number().finite(),
  }),
  strategies: z.array(
    z.object({
      strategyId: z.string().trim().min(1),
      sampleSize: z.number().finite().int().nonnegative(),
      completedMarkets: z.number().finite().int().nonnegative(),
      totalTrades: z.number().finite().int().nonnegative(),
      meanPnlCents: z.number().finite().nullable(),
      meanPnlStandardError: z.number().finite().nullable(),
      meanPnlTStatistic: z.number().finite().nullable(),
      meanPnlPValueOneTailed: z.number().finite().nullable(),
      meanPnlBootstrapConfidenceInterval: confidenceIntervalSchema,
      winRatePct: z.number().finite().nullable(),
      winRateBootstrapConfidenceInterval: confidenceIntervalSchema,
      confidenceInterval95: z.object({
        meanPnlCents: confidenceIntervalSchema,
        winRatePct: confidenceIntervalSchema,
      }),
      statisticallySignificant: z.boolean(),
      insufficientSample: z.boolean(),
      warnings: z.array(z.string().trim().min(1)),
      sourcePaths: z.array(z.string().trim().min(1)),
    }),
  ),
});

const strategyLeaderboardSchema = z.object({
  generatedAt: z.string().trim().min(1),
  inputRoot: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  rankBy: z.enum(STRATEGY_LEADERBOARD_RANK_METRICS),
  strategies: z.array(
    z.object({
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
      statisticallySignificant: z.boolean().optional(),
      sourcePaths: z.array(z.string().trim().min(1)),
    }),
  ),
});

const regimeTagCountRecordSchema = z.record(
  z.string(),
  z.number().finite().int().nonnegative(),
);

const legacyRegimeTagsSchema = z.object({
  generatedAt: z.string().trim().min(1),
  regimes: z.array(
    z.object({
      regimeId: z.string().trim().min(1),
      label: z.string().trim().min(1),
      marketCount: z.number().finite().int().nonnegative(),
      tags: z.array(z.string().trim().min(1)),
    }),
  ),
});

const regimeTagsReportSchema = z.object({
  generatedAt: z.string().trim().min(1),
  summaryCounts: z.object({
    volatility: regimeTagCountRecordSchema,
    trend: regimeTagCountRecordSchema,
    marketState: regimeTagCountRecordSchema,
  }),
});

function deriveRegimesFromSummaryCounts(summaryCounts: {
  volatility: Record<string, number>;
  trend: Record<string, number>;
  marketState: Record<string, number>;
}): RegimeTagsDocument["regimes"] {
  const regimes: RegimeTagsDocument["regimes"] = [];

  for (const [dimension, counts] of Object.entries(summaryCounts) as Array<
    [keyof typeof summaryCounts, Record<string, number>]
  >) {
    for (const [tag, marketCount] of Object.entries(counts)) {
      regimes.push({
        regimeId: `${dimension}-${tag}`,
        label: `${tag} ${dimension}`,
        marketCount,
        tags: [`${tag}-${dimension}`, `${tag}-vol`, tag],
      });
    }
  }

  return regimes;
}

function readOptionalRegimeTags(
  io: HypothesisCandidateIo,
  path: string,
): RegimeTagsDocument | null {
  if (!io.fileExists(path)) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(io.readFile(path));
  } catch {
    return null;
  }

  const legacy = legacyRegimeTagsSchema.safeParse(parsed);
  if (legacy.success) {
    return legacy.data;
  }

  const report = regimeTagsReportSchema.safeParse(parsed);
  if (report.success) {
    return {
      generatedAt: report.data.generatedAt,
      regimes: deriveRegimesFromSummaryCounts(report.data.summaryCounts),
    };
  }

  return null;
}

function parseJsonDocument<T>(
  path: string,
  json: string,
  schema: z.ZodType<T>,
): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new HypothesisCandidateError(
      `Invalid JSON in ${path}`,
      HypothesisCandidateErrorCode.INVALID_JSON,
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new HypothesisCandidateError(
      `Invalid document in ${path}: ${result.error.message}`,
      HypothesisCandidateErrorCode.INVALID_DOCUMENT,
    );
  }

  return result.data;
}

function readOptionalDocument<T>(
  io: HypothesisCandidateIo,
  path: string,
  schema: z.ZodType<T>,
): T | null {
  if (!io.fileExists(path)) {
    return null;
  }

  return parseJsonDocument(path, io.readFile(path), schema);
}

export function buildHypothesisCandidateInputStatus(options?: {
  mispricingAtlasPath?: string;
  leadLagAnalysisPath?: string;
  statisticalSignificancePath?: string;
  regimeTagsPath?: string;
  strategyLeaderboardPath?: string;
  io?: HypothesisCandidateIo;
}): HypothesisCandidateInputStatus {
  const mispricingAtlasPath =
    options?.mispricingAtlasPath ?? DEFAULT_MISPRICING_ATLAS_INPUT_PATH;
  const leadLagAnalysisPath =
    options?.leadLagAnalysisPath ?? DEFAULT_LEAD_LAG_INPUT_PATH;
  const statisticalSignificancePath =
    options?.statisticalSignificancePath ?? DEFAULT_STATISTICAL_SIGNIFICANCE_INPUT_PATH;
  const regimeTagsPath = options?.regimeTagsPath ?? DEFAULT_REGIME_TAGS_INPUT_PATH;
  const strategyLeaderboardPath =
    options?.strategyLeaderboardPath ?? DEFAULT_STRATEGY_LEADERBOARD_INPUT_PATH;
  const io = options?.io;

  return {
    mispricingAtlasPath,
    leadLagAnalysisPath,
    statisticalSignificancePath,
    regimeTagsPath,
    strategyLeaderboardPath,
    mispricingAtlasPresent: io ? io.fileExists(mispricingAtlasPath) : false,
    leadLagAnalysisPresent: io ? io.fileExists(leadLagAnalysisPath) : false,
    statisticalSignificancePresent: io
      ? io.fileExists(statisticalSignificancePath)
      : false,
    regimeTagsPresent: io ? io.fileExists(regimeTagsPath) : false,
    strategyLeaderboardPresent: io ? io.fileExists(strategyLeaderboardPath) : false,
  };
}

export function loadHypothesisCandidateInputs(
  io: HypothesisCandidateIo,
  options?: {
    mispricingAtlasPath?: string;
    leadLagAnalysisPath?: string;
    statisticalSignificancePath?: string;
    regimeTagsPath?: string;
    strategyLeaderboardPath?: string;
  },
): {
  inputs: ParsedHypothesisCandidateInputs;
  inputStatus: HypothesisCandidateInputStatus;
} {
  const inputStatus = buildHypothesisCandidateInputStatus({ ...options, io });

  return {
    inputStatus,
    inputs: {
      mispricingAtlas: readOptionalDocument(
        io,
        inputStatus.mispricingAtlasPath,
        mispricingAtlasSchema,
      ) as MispricingAtlas | null,
      leadLagAnalysis: readOptionalDocument(
        io,
        inputStatus.leadLagAnalysisPath,
        leadLagAnalysisSchema,
      ) as LeadLagAnalysis | null,
      statisticalSignificance: readOptionalDocument(
        io,
        inputStatus.statisticalSignificancePath,
        statisticalSignificanceSchema,
      ) as StatisticalSignificanceReport | null,
      regimeTags: readOptionalRegimeTags(io, inputStatus.regimeTagsPath),
      strategyLeaderboard: readOptionalDocument(
        io,
        inputStatus.strategyLeaderboardPath,
        strategyLeaderboardSchema,
      ) as StrategyLeaderboard | null,
    },
  };
}
