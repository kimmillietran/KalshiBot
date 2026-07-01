import { z } from "zod";

import type { StrategyPlugin, StrategyPluginConfig } from "../strategyPluginTypes";
import {
  readYesAskCents,
  readYesMidCents,
} from "./strategyDecisionHelpers";

const buyBelowProbabilityConfigSchema = z
  .object({
    maxYesMidCents: z.number().finite().int().min(1).max(99).default(50),
    quantity: z.number().finite().int().positive().default(1),
  })
  .strict();

export type BuyBelowProbabilityStrategyPluginConfig = z.infer<
  typeof buyBelowProbabilityConfigSchema
>;

export const buyBelowProbabilityStrategyPlugin: StrategyPlugin = {
  strategyId: "buy-below-probability",
  description:
    "Buys YES when the market yes mid is at or below a configured probability threshold",
  configSchema: buyBelowProbabilityConfigSchema as z.ZodType<StrategyPluginConfig>,
  createInitialState: () => ({}),
  decide: ({ step, config }) => {
    const parsed = buyBelowProbabilityConfigSchema.parse(config);
    const yesMidCents = readYesMidCents(step.engineInput.pricing);
    const yesAskCents = readYesAskCents(step.engineInput.pricing);

    if (
      yesMidCents === null
      || yesAskCents === null
      || yesMidCents > parsed.maxYesMidCents
    ) {
      return { intents: [], nextState: {} };
    }

    return {
      intents: [
        {
          ticker: step.sourceTicker,
          side: "yes",
          action: "buy",
          quantity: parsed.quantity,
          limitPriceCents: yesAskCents,
          reason: "buy-below-probability",
        },
      ],
      nextState: {},
    };
  },
};
