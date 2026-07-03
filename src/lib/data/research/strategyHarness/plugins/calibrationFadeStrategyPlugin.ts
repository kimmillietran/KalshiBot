import { z } from "zod";

import type { StrategyPlugin, StrategyPluginConfig } from "@/lib/data/strategies/plugin/strategyPluginTypes";
import {
  readNoAskCents,
  readYesAskCents,
  readYesMidCents,
} from "@/lib/data/strategies/plugin/builtins/strategyDecisionHelpers";

import type { SynthesizedStrategyDirection } from "../strategyHarnessTypes";

export const CALIBRATION_FADE_STRATEGY_ID = "calibration-fade";

const calibrationFadeDirectionSchema = z.enum([
  "buy-yes",
  "buy-no",
  "fade-yes",
  "fade-no",
]);

const calibrationFadeConfigSchema = z
  .object({
    direction: calibrationFadeDirectionSchema,
    yesMidThresholdCents: z.number().finite().int().min(1).max(99),
    quantity: z.number().finite().int().positive().default(1),
    hypothesisId: z.string().trim().min(1).optional(),
  })
  .strict();

export type CalibrationFadeStrategyPluginConfig = z.infer<
  typeof calibrationFadeConfigSchema
>;

function resolvesToBuyNo(direction: SynthesizedStrategyDirection): boolean {
  return direction === "fade-yes" || direction === "buy-no";
}

/** Research-only strategy that fades miscalibrated YES prices. */
export const calibrationFadeStrategyPlugin: StrategyPlugin = {
  strategyId: CALIBRATION_FADE_STRATEGY_ID,
  description:
    "Fades miscalibrated YES pricing by buying the opposing side when yes mid crosses a threshold",
  configSchema: calibrationFadeConfigSchema as z.ZodType<StrategyPluginConfig>,
  createInitialState: () => ({}),
  decide: ({ step, config }) => {
    const parsed = calibrationFadeConfigSchema.parse(config);
    const yesMidCents = readYesMidCents(step.engineInput.pricing);
    const yesAskCents = readYesAskCents(step.engineInput.pricing);
    const noAskCents = readNoAskCents(step.engineInput.pricing);
    const buyNo = resolvesToBuyNo(parsed.direction);
    const metadata = {
      direction: parsed.direction,
      yesMidThresholdCents: parsed.yesMidThresholdCents,
      hypothesisId: parsed.hypothesisId ?? null,
    };

    if (yesMidCents === null) {
      return {
        intents: [],
        nextState: {},
        decisionTrace: {
          action: "hold",
          reason: "missing-pricing",
          metadata,
        },
      };
    }

    if (buyNo) {
      if (yesMidCents < parsed.yesMidThresholdCents) {
        return {
          intents: [],
          nextState: {},
          decisionTrace: {
            action: "hold",
            reason: "below-fade-threshold",
            metadata,
          },
        };
      }

      if (noAskCents === null) {
        return {
          intents: [],
          nextState: {},
          decisionTrace: {
            action: "hold",
            reason: "missing-no-ask",
            metadata,
          },
        };
      }

      return {
        intents: [
          {
            ticker: step.sourceTicker,
            side: "no",
            action: "buy",
            quantity: parsed.quantity,
            limitPriceCents: noAskCents,
            reason: CALIBRATION_FADE_STRATEGY_ID,
          },
        ],
        nextState: {},
        decisionTrace: {
          action: "buy_no",
          reason: CALIBRATION_FADE_STRATEGY_ID,
          metadata,
        },
      };
    }

    if (yesMidCents > parsed.yesMidThresholdCents) {
      return {
        intents: [],
        nextState: {},
        decisionTrace: {
          action: "hold",
          reason: "above-fade-threshold",
          metadata,
        },
      };
    }

    if (yesAskCents === null) {
      return {
        intents: [],
        nextState: {},
        decisionTrace: {
          action: "hold",
          reason: "missing-yes-ask",
          metadata,
        },
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
          reason: CALIBRATION_FADE_STRATEGY_ID,
        },
      ],
      nextState: {},
      decisionTrace: {
        action: "buy_yes",
        reason: CALIBRATION_FADE_STRATEGY_ID,
        metadata,
      },
    };
  },
};
