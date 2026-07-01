import { z } from "zod";

import { buyFirstAskIntent } from "../../builtins/buyFirstAskIntent";
import type { StrategyPlugin, StrategyPluginConfig } from "../strategyPluginTypes";

const buyFirstAskConfigSchema: z.ZodType<StrategyPluginConfig> = z.object({}).strict();

export const buyFirstAskStrategyPlugin: StrategyPlugin<StrategyPluginConfig> = {
  strategyId: "buy-first-ask",
  description: "Buys one YES contract at the step yes ask when pricing is available",
  configSchema: buyFirstAskConfigSchema,
  createInitialState: () => ({}),
  decide: ({ step }) => ({
    intents: buyFirstAskIntent(step),
    nextState: {},
  }),
};
