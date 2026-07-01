import { z } from "zod";

import type { StrategyPlugin, StrategyPluginConfig } from "../strategyPluginTypes";
import {
  computeBtcMomentumPct,
  readYesAskCents,
} from "./strategyDecisionHelpers";

const simpleMomentumConfigSchema = z
  .object({
    lookbackBars: z.number().finite().int().min(2).default(3),
    momentumThresholdPct: z.number().finite().nonnegative().default(0.05),
    quantity: z.number().finite().int().positive().default(1),
  })
  .strict();

export type SimpleMomentumStrategyPluginConfig = z.infer<
  typeof simpleMomentumConfigSchema
>;

export const simpleMomentumStrategyPlugin: StrategyPlugin = {
  strategyId: "simple-momentum",
  description:
    "Buys YES when recent BTC candle momentum exceeds a configured threshold",
  configSchema: simpleMomentumConfigSchema as z.ZodType<StrategyPluginConfig>,
  createInitialState: () => ({}),
  decide: ({ step, config }) => {
    const parsed = simpleMomentumConfigSchema.parse(config);
    const candles = step.engineInput.btc?.candles ?? [];
    const momentumPct = computeBtcMomentumPct(candles, parsed.lookbackBars);
    const yesAskCents = readYesAskCents(step.engineInput.pricing);

    if (
      momentumPct === null
      || yesAskCents === null
      || momentumPct < parsed.momentumThresholdPct
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
          reason: "simple-momentum",
        },
      ],
      nextState: {},
    };
  },
};
