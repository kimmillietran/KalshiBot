import { z } from "zod";

import type { StrategyPlugin, StrategyPluginConfig } from "../strategyPluginTypes";
import {
  appendRollingWindow,
  computeRollingMean,
  readYesAskCents,
  readYesMidCents,
} from "./strategyDecisionHelpers";

const simpleMeanReversionConfigSchema = z
  .object({
    windowSize: z.number().finite().int().min(2).default(5),
    deviationCents: z.number().finite().nonnegative().default(5),
    quantity: z.number().finite().int().positive().default(1),
  })
  .strict();

export type SimpleMeanReversionStrategyPluginConfig = z.infer<
  typeof simpleMeanReversionConfigSchema
>;

export const simpleMeanReversionStrategyPlugin: StrategyPlugin = {
  strategyId: "simple-mean-reversion",
  description:
    "Buys YES when the market yes mid falls below its rolling mean by a configured deviation",
  configSchema: simpleMeanReversionConfigSchema as z.ZodType<StrategyPluginConfig>,
  createInitialState: () => ({ mids: [] }),
  decide: ({ step, config, state }) => {
    const parsed = simpleMeanReversionConfigSchema.parse(config);
    const yesMidCents = readYesMidCents(step.engineInput.pricing);
    const yesAskCents = readYesAskCents(step.engineInput.pricing);
    const priorMids = Array.isArray(state.mids)
      ? state.mids.filter((value): value is number => Number.isFinite(value))
      : [];

    if (yesMidCents === null) {
      return { intents: [], nextState: { mids: priorMids } };
    }

    const nextMids = appendRollingWindow(
      priorMids,
      yesMidCents,
      parsed.windowSize,
    );
    const meanMid = computeRollingMean(
      nextMids.length >= parsed.windowSize
        ? nextMids.slice(0, -1)
        : priorMids,
    );

    if (
      meanMid === null
      || yesAskCents === null
      || yesMidCents > meanMid - parsed.deviationCents
    ) {
      return {
        intents: [],
        nextState: { mids: nextMids },
      };
    }

    return {
      intents: [
        {
          ticker: step.sourceTicker,
          side: "yes",
          action: "buy",
          quantity: parsed.quantity,
          limitPriceCents: yesAskCents,
          reason: "simple-mean-reversion",
        },
      ],
      nextState: { mids: nextMids },
    };
  },
};
