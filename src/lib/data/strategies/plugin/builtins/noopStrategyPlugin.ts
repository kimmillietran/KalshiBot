import { z } from "zod";

import type { StrategyPlugin, StrategyPluginConfig } from "../strategyPluginTypes";

const noopConfigSchema = z.object({}).strict();

export type NoopStrategyPluginConfig = z.infer<typeof noopConfigSchema>;

export const noopStrategyPlugin: StrategyPlugin = {
  strategyId: "noop",
  description: "Never emits trade intents",
  configSchema: noopConfigSchema as z.ZodType<StrategyPluginConfig>,
  createInitialState: () => ({}),
  decide: () => ({
    intents: [],
    nextState: {},
    decisionTrace: {
      action: "hold",
      reason: "noop",
      metadata: {},
    },
  }),
};
