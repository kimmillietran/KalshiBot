import { z } from "zod";

import { rawHistoricalRecordSchema } from "@/lib/data/schemas";
import type { BacktestStrategy } from "@/lib/data/backtesting/strategyTypes";
import type { TradeIntent } from "@/lib/data/backtesting/strategyTypes";
import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import type { RawHistoricalRecord } from "@/lib/data/types";
import type { EngineConfig } from "@/types/domain/trading";

export const BUILTIN_STRATEGY_IDS = ["noop", "buy-first-ask"] as const;

export type BuiltinStrategyId = (typeof BUILTIN_STRATEGY_IDS)[number];

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
});

export type HistoricalResearchCliInputDocument = z.infer<
  typeof historicalResearchCliInputSchema
> & {
  engineConfig: EngineConfig;
  bronzeRecords: RawHistoricalRecord[];
};

export class HistoricalResearchCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoricalResearchCommandError";
  }
}

export type HistoricalResearchCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile?: (path: string, data: string) => void;
};

const noopStrategy: BacktestStrategy = {
  strategyId: "noop",
  decide: () => [],
};

function buyFirstAskIntent(step: ReplayStepResult): TradeIntent[] {
  const yesAskCents = step.engineInput.pricing?.yesAskCents;
  if (yesAskCents === null || yesAskCents === undefined) {
    return [];
  }

  return [
    {
      ticker: step.sourceTicker,
      side: "yes",
      action: "buy",
      quantity: 1,
      limitPriceCents: yesAskCents,
      reason: "buy-first-ask",
    },
  ];
}

const buyFirstAskStrategy: BacktestStrategy = {
  strategyId: "buy-first-ask",
  decide: buyFirstAskIntent,
};

export function resolveBuiltinStrategy(strategyId: BuiltinStrategyId): BacktestStrategy {
  switch (strategyId) {
    case "noop":
      return noopStrategy;
    case "buy-first-ask":
      return buyFirstAskStrategy;
    default: {
      const exhaustive: never = strategyId;
      throw new HistoricalResearchCommandError(
        `Unsupported built-in strategy: ${String(exhaustive)}`,
      );
    }
  }
}
