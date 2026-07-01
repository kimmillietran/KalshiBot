import { z } from "zod";

import { buyFirstAskIntent } from "../../builtins/buyFirstAskIntent";
import type { StrategyPlugin, StrategyPluginConfig } from "../strategyPluginTypes";

const buyFirstAskConfigSchema = z
  .object({
    quantity: z.number().finite().int().positive().default(1),
  })
  .strict();

export type BuyFirstAskStrategyPluginConfig = z.infer<typeof buyFirstAskConfigSchema>;

export const buyFirstAskStrategyPlugin: StrategyPlugin = {
  strategyId: "buy-first-ask",
  description: "Buys YES contracts at the step yes ask when pricing is available",
  configSchema: buyFirstAskConfigSchema as z.ZodType<StrategyPluginConfig>,
  createInitialState: () => ({}),
  decide: ({ step, config }) => {
    const parsed = buyFirstAskConfigSchema.parse(config);
    const intents = buyFirstAskIntent(step);
    if (intents.length === 0 || parsed.quantity === 1) {
      return { intents, nextState: {} };
    }

    return {
      intents: intents.map((intent) => ({
        ...intent,
        quantity: parsed.quantity,
      })),
      nextState: {},
    };
  },
};
