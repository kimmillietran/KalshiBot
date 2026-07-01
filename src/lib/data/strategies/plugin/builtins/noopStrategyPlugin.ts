import { z } from "zod";

import type { StrategyPlugin, StrategyPluginConfig } from "../strategyPluginTypes";

const noopConfigSchema: z.ZodType<StrategyPluginConfig> = z.object({}).strict();

export const noopStrategyPlugin: StrategyPlugin<StrategyPluginConfig> = {
  strategyId: "noop",
  description: "Never emits trade intents",
  configSchema: noopConfigSchema,
  createInitialState: () => ({}),
  decide: () => ({
    intents: [],
    nextState: {},
  }),
};
