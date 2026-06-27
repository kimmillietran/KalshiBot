import { clamp01 } from "@/lib/features/normalize";

import {
  DEFAULT_EXPECTED_VALUE_CONFIG,
  EXPECTED_VALUE_MODEL_VERSION,
  type ExpectedValueConfig,
} from "./config";
import { buildExpectedValueReasoning } from "./reasoning";
import {
  ExpectedValueInputError,
  type EstimateExpectedValueInput,
  type ExpectedValueEstimate,
  type ExpectedValueSide,
} from "./types";

function assertProbability(probability: EstimateExpectedValueInput["probability"]): void {
  const { probabilityUp, probabilityDown } = probability;

  if (
    !Number.isFinite(probabilityUp) ||
    !Number.isFinite(probabilityDown) ||
    probabilityUp < 0 ||
    probabilityUp > 1 ||
    probabilityDown < 0 ||
    probabilityDown > 1
  ) {
    throw new ExpectedValueInputError("probability values must be finite and in [0, 1]");
  }

  if (Math.abs(probabilityUp + probabilityDown - 1) > 1e-6) {
    throw new ExpectedValueInputError("probabilityUp and probabilityDown must sum to 1");
  }
}

function assertAskCents(value: number | null, side: ExpectedValueSide): number {
  if (value === null || !Number.isFinite(value) || value <= 0 || value >= 100) {
    throw new ExpectedValueInputError(`${side} ask must be a finite cent value in (0, 100)`);
  }
  return value;
}

function grossEvCents(
  winProbability: number,
  loseProbability: number,
  askCents: number,
): number {
  const winPayoutCents = 100 - askCents;
  return winProbability * winPayoutCents - loseProbability * askCents;
}

function edgePercent(fairCents: number, askCents: number): number {
  if (askCents <= 0) {
    return 0;
  }
  return ((fairCents - askCents) / askCents) * 100;
}

function clampEvCents(value: number, maxAbs: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value > maxAbs) return maxAbs;
  if (value < -maxAbs) return -maxAbs;
  return value;
}

function spreadConfidenceMultiplier(
  features: EstimateExpectedValueInput["features"],
  config: ExpectedValueConfig,
): number {
  const maxSpread = features.spreadPercent.maxSpreadPercent;
  if (maxSpread === null || maxSpread <= 0) {
    return 1;
  }

  const penalty = clamp01(maxSpread / Math.max(config.maxSpreadForFullConfidence, 1e-9));
  return clamp01(1 - penalty * 0.5);
}

function resolveBestSide(
  netEvYesCents: number,
  netEvNoCents: number,
): { bestSide: ExpectedValueSide | null; bestEvCents: number } {
  if (netEvYesCents === netEvNoCents) {
    if (netEvYesCents === 0) {
      return { bestSide: null, bestEvCents: 0 };
    }
    // Tie-break: prefer YES when both sides share equal positive/negative EV.
    return { bestSide: "yes", bestEvCents: netEvYesCents };
  }

  if (netEvYesCents > netEvNoCents) {
    return { bestSide: "yes", bestEvCents: netEvYesCents };
  }

  return { bestSide: "no", bestEvCents: netEvNoCents };
}

/**
 * Deterministic expected-value estimate from model probability and market asks.
 *
 * EV per contract (cents) = P(win) × (100 − ask) − P(lose) × ask
 */
export function estimateExpectedValue(
  input: EstimateExpectedValueInput,
  config: ExpectedValueConfig = DEFAULT_EXPECTED_VALUE_CONFIG,
): ExpectedValueEstimate {
  assertProbability(input.probability);

  const yesAskCents = assertAskCents(input.pricing.yesAskCents, "yes");
  const noAskCents = assertAskCents(input.pricing.noAskCents, "no");

  const fairYesCents = input.probability.probabilityUp * 100;
  const fairNoCents = input.probability.probabilityDown * 100;

  const evYesCents = clampEvCents(
    grossEvCents(
      input.probability.probabilityUp,
      input.probability.probabilityDown,
      yesAskCents,
    ),
    config.maxAbsEvCents,
  );
  const evNoCents = clampEvCents(
    grossEvCents(
      input.probability.probabilityDown,
      input.probability.probabilityUp,
      noAskCents,
    ),
    config.maxAbsEvCents,
  );

  const netEvYesCents = clampEvCents(
    evYesCents - config.feeCentsPerContract,
    config.maxAbsEvCents,
  );
  const netEvNoCents = clampEvCents(
    evNoCents - config.feeCentsPerContract,
    config.maxAbsEvCents,
  );

  const edgeYesPercent = edgePercent(fairYesCents, yesAskCents);
  const edgeNoPercent = edgePercent(fairNoCents, noAskCents);

  const spreadMultiplier = spreadConfidenceMultiplier(input.features, config);
  const confidence = clamp01(input.probability.confidence * spreadMultiplier);

  const { bestSide, bestEvCents } = resolveBestSide(netEvYesCents, netEvNoCents);

  const estimate: ExpectedValueEstimate = {
    modelVersion: EXPECTED_VALUE_MODEL_VERSION,
    evYesCents,
    evNoCents,
    netEvYesCents,
    netEvNoCents,
    fairYesCents,
    fairNoCents,
    edgeYesPercent,
    edgeNoPercent,
    bestSide,
    bestEvCents,
    confidence,
    reasoning: { summary: "", lines: [] },
  };

  return {
    ...estimate,
    reasoning: buildExpectedValueReasoning(estimate),
  };
}

export {
  DEFAULT_EXPECTED_VALUE_CONFIG,
  EXPECTED_VALUE_MODEL_VERSION,
} from "./config";

export type {
  EstimateExpectedValueInput,
  ExpectedValueEstimate,
  ExpectedValuePricingInput,
  ExpectedValueReasoning,
  ExpectedValueSide,
} from "./types";

export { ExpectedValueInputError } from "./types";

export { buildExpectedValueReasoning } from "./reasoning";
