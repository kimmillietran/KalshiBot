import { z } from "zod";

import type { ResearchSeriesAggregateSummary } from "../aggregation/researchAggregateTypes";

import {
  StrategyLeaderboardError,
  StrategyLeaderboardErrorCode,
} from "./strategyLeaderboardTypes";

const marketResultSchema = z.object({
  marketTicker: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  status: z.enum(["completed", "failed"]),
  durationMs: z.number().finite().nonnegative(),
  error: z.string().nullable(),
  metrics: z
    .object({
      totalPnlCents: z.number().finite(),
      totalReturnPct: z.number().finite(),
      maxDrawdownPct: z.number().finite().nonnegative(),
      sharpeRatio: z.number().finite().nullable(),
      winRatePct: z.number().finite().nonnegative(),
      lossRatePct: z.number().finite().nonnegative(),
      tradeCount: z.number().finite().int().nonnegative(),
      winningTradeCount: z.number().finite().int().nonnegative(),
      losingTradeCount: z.number().finite().int().nonnegative(),
      fillCount: z.number().finite().int().nonnegative().optional(),
      contractsFilled: z.number().finite().int().nonnegative().optional(),
    })
    .nullable(),
});

const aggregateSummarySchema = z.object({
  generatedAt: z.string().trim().min(1),
  seriesTicker: z.string().trim().min(1),
  inputRoot: z.string().trim().min(1),
  marketCounts: z.object({
    total: z.number().finite().int().nonnegative(),
    completed: z.number().finite().int().nonnegative(),
    failed: z.number().finite().int().nonnegative(),
  }),
  performance: z.object({
    totalTrades: z.number().finite().int().nonnegative(),
    totalFills: z.number().finite().int().nonnegative().optional(),
    totalContractsFilled: z.number().finite().int().nonnegative().optional(),
    totalPnlCents: z.number().finite(),
    averagePnlCents: z.number().finite(),
    medianPnlCents: z.number().finite(),
    averageReturnPct: z.number().finite(),
    winRatePct: z.number().finite().nonnegative(),
    lossRatePct: z.number().finite().nonnegative(),
    maxDrawdownPct: z.number().finite().nonnegative(),
    sharpeRatio: z.number().finite().nullable(),
  }),
  duration: z.object({
    totalDurationMs: z.number().finite().nonnegative(),
    averageDurationMs: z.number().finite().nonnegative(),
    medianDurationMs: z.number().finite().nonnegative(),
    minDurationMs: z.number().finite().nonnegative(),
    maxDurationMs: z.number().finite().nonnegative(),
  }),
  markets: z.array(marketResultSchema),
});

/** Parses and validates an aggregate-summary.json document. */
export function parseAggregateSummaryJson(
  json: string,
  sourcePath: string,
): ResearchSeriesAggregateSummary {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new StrategyLeaderboardError(
      `Invalid JSON in aggregate summary: ${sourcePath}`,
      StrategyLeaderboardErrorCode.INVALID_AGGREGATE_SUMMARY,
    );
  }

  const result = aggregateSummarySchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new StrategyLeaderboardError(
      issue?.message ?? `Invalid aggregate summary: ${sourcePath}`,
      StrategyLeaderboardErrorCode.INVALID_AGGREGATE_SUMMARY,
    );
  }

  return {
    ...result.data,
    performance: {
      ...result.data.performance,
      totalFills: result.data.performance.totalFills ?? 0,
      totalContractsFilled: result.data.performance.totalContractsFilled ?? 0,
    },
    markets: result.data.markets.map((market) => ({
      ...market,
      metrics:
        market.metrics === null
          ? null
          : {
              ...market.metrics,
              fillCount: market.metrics.fillCount ?? 0,
              contractsFilled: market.metrics.contractsFilled ?? 0,
            },
    })),
  };
}
