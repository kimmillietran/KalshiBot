import { z } from "zod";

import {
  computeEdgeCents,
  evaluateFairValueDiffusion,
} from "@/lib/data/strategies/fairValueDiffusion";

import type {
  StrategyPlugin,
  StrategyPluginConfig,
  StrategyPluginDecisionTrace,
} from "../strategyPluginTypes";
import {
  readNoAskCents,
  readYesAskCents,
  readYesMidCents,
} from "./strategyDecisionHelpers";

const fairValueDiffusionConfigSchema = z
  .object({
    volatilityLookbackBars: z.number().finite().int().min(2).default(10),
    minimumEdgeThresholdCents: z.number().finite().nonnegative().default(5),
    minimumTimeRemainingMs: z.number().finite().nonnegative().default(60_000),
    maxPositionSize: z.number().finite().int().positive().default(1),
  })
  .strict();

export type FairValueDiffusionStrategyPluginConfig = z.infer<
  typeof fairValueDiffusionConfigSchema
>;

function holdTrace(
  reason: string,
  metadata: Record<string, unknown>,
): StrategyPluginDecisionTrace {
  return {
    action: "hold",
    reason,
    metadata,
  };
}

export const fairValueDiffusionStrategyPlugin: StrategyPlugin = {
  strategyId: "fair-value-diffusion",
  description:
    "Estimates fair settlement probability via a diffusion model and trades when edge exceeds a threshold",
  configSchema: fairValueDiffusionConfigSchema as z.ZodType<StrategyPluginConfig>,
  createInitialState: () => ({}),
  decide: ({ step, config }) => {
    const parsed = fairValueDiffusionConfigSchema.parse(config);
    const market = step.engineInput.market;
    const btc = step.engineInput.btc;
    const yesMidCents = readYesMidCents(step.engineInput.pricing);
    const yesAskCents = readYesAskCents(step.engineInput.pricing);
    const noAskCents = readNoAskCents(step.engineInput.pricing);
    const baseMetadata = {
      threshold: parsed.minimumEdgeThresholdCents,
    };

    if (
      market === null
      || btc === null
      || yesMidCents === null
      || market.strikePrice === null
      || market.strikePrice === undefined
      || !Number.isFinite(market.strikePrice)
      || market.timeRemainingMs < parsed.minimumTimeRemainingMs
    ) {
      return {
        intents: [],
        nextState: {},
        decisionTrace: holdTrace("guard-failed", baseMetadata),
      };
    }

    const evaluation = evaluateFairValueDiffusion({
      spotPrice: btc.price,
      strikePrice: market.strikePrice,
      timeRemainingMs: market.timeRemainingMs,
      candles: btc.candles ?? [],
      volatilityLookbackBars: parsed.volatilityLookbackBars,
    });

    if (evaluation === null) {
      return {
        intents: [],
        nextState: {},
        decisionTrace: holdTrace("evaluation-unavailable", baseMetadata),
      };
    }

    const edge = computeEdgeCents(
      evaluation.probability.fairYesProbability,
      yesMidCents,
    );

    const evaluationMetadata = {
      ...baseMetadata,
      volatility: evaluation.volatility.annualizedVol,
      fairProbability: evaluation.probability.fairYesProbability,
      edge: edge?.edgeCents ?? null,
    };

    if (edge === null) {
      return {
        intents: [],
        nextState: {},
        decisionTrace: holdTrace("edge-unavailable", evaluationMetadata),
      };
    }

    if (edge.edgeCents >= parsed.minimumEdgeThresholdCents) {
      if (yesAskCents === null) {
        return {
          intents: [],
          nextState: {},
          decisionTrace: holdTrace("missing-yes-ask", evaluationMetadata),
        };
      }

      return {
        intents: [
          {
            ticker: step.sourceTicker,
            side: "yes",
            action: "buy",
            quantity: parsed.maxPositionSize,
            limitPriceCents: yesAskCents,
            reason: "fair-value-diffusion",
          },
        ],
        nextState: {},
        decisionTrace: {
          action: "buy_yes",
          reason: "fair-value-diffusion",
          metadata: evaluationMetadata,
        },
      };
    }

    if (edge.edgeCents <= -parsed.minimumEdgeThresholdCents) {
      if (noAskCents === null) {
        return {
          intents: [],
          nextState: {},
          decisionTrace: holdTrace("missing-no-ask", evaluationMetadata),
        };
      }

      return {
        intents: [
          {
            ticker: step.sourceTicker,
            side: "no",
            action: "buy",
            quantity: parsed.maxPositionSize,
            limitPriceCents: noAskCents,
            reason: "fair-value-diffusion",
          },
        ],
        nextState: {},
        decisionTrace: {
          action: "buy_no",
          reason: "fair-value-diffusion",
          metadata: evaluationMetadata,
        },
      };
    }

    return {
      intents: [],
      nextState: {},
      decisionTrace: holdTrace("edge-below-threshold", evaluationMetadata),
    };
  },
};
