import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import type { StrategyPluginDecisionTrace } from "@/lib/data/strategies/plugin/strategyPluginTypes";
import {
  readYesAskCents,
  readYesBidCents,
  readYesMidCents,
} from "@/lib/data/strategies/plugin/builtins/strategyDecisionHelpers";

import type { StrategyDecisionTraceEntry } from "./strategyDecisionTraceTypes";

export type BuildStrategyDecisionTraceEntryInput = {
  step: ReplayStepResult;
  strategyId: string;
  pluginTrace: StrategyPluginDecisionTrace;
};

function readBtcPrice(
  btc: ReplayStepResult["engineInput"]["btc"],
): number | null {
  const price = btc?.price;
  return price === null || price === undefined || !Number.isFinite(price) ? null : price;
}

function readProbabilityUp(
  step: ReplayStepResult,
  pluginTrace: StrategyPluginDecisionTrace,
): number | undefined {
  const fairProbability = pluginTrace.metadata.fairProbability;
  if (typeof fairProbability === "number" && Number.isFinite(fairProbability)) {
    return fairProbability;
  }

  const engineProbability = step.engineOutput.probability?.probabilityUp;
  if (typeof engineProbability === "number" && Number.isFinite(engineProbability)) {
    return engineProbability;
  }

  return undefined;
}

/** Builds a candle-level decision trace entry from replay context and plugin output. */
export function buildStrategyDecisionTraceEntry(
  input: BuildStrategyDecisionTraceEntryInput,
): StrategyDecisionTraceEntry {
  const pricing = input.step.engineInput.pricing;
  const probabilityUp = readProbabilityUp(input.step, input.pluginTrace);

  return {
    timestamp: input.step.engineInput.evaluatedAt,
    candleIndex: input.step.stepIndex,
    strategyId: input.strategyId,
    marketTicker: input.step.sourceTicker,
    btcPrice: readBtcPrice(input.step.engineInput.btc),
    yesBid: readYesBidCents(pricing),
    yesAsk: readYesAskCents(pricing),
    yesMid: readYesMidCents(pricing),
    ...(probabilityUp !== undefined ? { probabilityUp } : {}),
    action: input.pluginTrace.action,
    reason: input.pluginTrace.reason,
    metadata: structuredClone(input.pluginTrace.metadata),
  };
}
