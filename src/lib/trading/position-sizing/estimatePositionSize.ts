import { clamp01 } from "@/lib/features/normalize";

import {
  DEFAULT_POSITION_SIZING_CONFIG,
  POSITION_SIZING_MODEL_VERSION,
  type PositionSizingConfig,
} from "./config";
import { buildPositionSizingReasoning } from "./reasoning";
import type {
  EstimatePositionSizeInput,
  PositionSide,
  PositionSizeEstimate,
} from "./types";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampFraction(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= max) {
    return max;
  }
  return value;
}

function combinedConfidence(
  probability: EstimatePositionSizeInput["probability"],
  expectedValue: EstimatePositionSizeInput["expectedValue"],
): number {
  return clamp01(Math.min(probability.confidence, expectedValue.confidence));
}

function actionToSide(action: EstimatePositionSizeInput["action"]): PositionSide | null {
  switch (action) {
    case "BUY UP":
      return "yes";
    case "BUY DOWN":
      return "no";
    default:
      return null;
  }
}

function askFromFairAndEdge(fairCents: number, edgePercent: number): number | null {
  if (!isFiniteNumber(fairCents) || !isFiniteNumber(edgePercent)) {
    return null;
  }

  const divisor = 1 + edgePercent / 100;
  if (divisor <= 0) {
    return null;
  }

  const askCents = fairCents / divisor;
  if (!isFiniteNumber(askCents) || askCents <= 0 || askCents >= 100) {
    return null;
  }

  return askCents;
}

/**
 * Full Kelly fraction for a binary Kalshi contract bought at `askCents`.
 *
 * Net odds b = (100 − ask) / ask
 * f* = (b × p − q) / b
 */
export function rawKellyFraction(winProbability: number, askCents: number): number {
  if (
    !isFiniteNumber(winProbability) ||
    winProbability <= 0 ||
    winProbability >= 1 ||
    !isFiniteNumber(askCents) ||
    askCents <= 0 ||
    askCents >= 100
  ) {
    return 0;
  }

  const loseProbability = 1 - winProbability;
  const winPayoutCents = 100 - askCents;
  if (winPayoutCents <= 0) {
    return 0;
  }

  const netOdds = winPayoutCents / askCents;
  return (netOdds * winProbability - loseProbability) / netOdds;
}

function sideMetrics(
  side: PositionSide,
  probability: EstimatePositionSizeInput["probability"],
  expectedValue: EstimatePositionSizeInput["expectedValue"],
): {
  winProbability: number;
  edgePercent: number;
  netEvCents: number;
  fairCents: number;
} {
  if (side === "yes") {
    return {
      winProbability: probability.probabilityUp,
      edgePercent: expectedValue.edgeYesPercent,
      netEvCents: expectedValue.netEvYesCents,
      fairCents: expectedValue.fairYesCents,
    };
  }

  return {
    winProbability: probability.probabilityDown,
    edgePercent: expectedValue.edgeNoPercent,
    netEvCents: expectedValue.netEvNoCents,
    fairCents: expectedValue.fairNoCents,
  };
}

function inputsAreValid(input: EstimatePositionSizeInput): boolean {
  const { probability, expectedValue, engineConfig } = input;

  return (
    isFiniteNumber(probability.probabilityUp) &&
    isFiniteNumber(probability.probabilityDown) &&
    isFiniteNumber(probability.confidence) &&
    isFiniteNumber(expectedValue.confidence) &&
    isFiniteNumber(expectedValue.edgeYesPercent) &&
    isFiniteNumber(expectedValue.edgeNoPercent) &&
    isFiniteNumber(expectedValue.netEvYesCents) &&
    isFiniteNumber(expectedValue.netEvNoCents) &&
    isFiniteNumber(expectedValue.fairYesCents) &&
    isFiniteNumber(expectedValue.fairNoCents) &&
    isFiniteNumber(engineConfig.minEdgePercent)
  );
}

function zeroEstimate(
  input: EstimatePositionSizeInput,
  context: {
    side: PositionSide | null;
    rawKellyFraction: number;
    cappedFraction: number;
    confidence: number;
    winProbability: number;
    askCents: number | null;
    edgePercent: number;
  },
  config: PositionSizingConfig,
): PositionSizeEstimate {
  const base = {
    modelVersion: POSITION_SIZING_MODEL_VERSION,
    side: context.side,
    recommendedFraction: 0,
    recommendedPercent: 0,
    recommendedDollars: null,
    cappedFraction: context.cappedFraction,
    rawKellyFraction: context.rawKellyFraction,
  };

  return {
    ...base,
    reasoning: buildPositionSizingReasoning({
      ...base,
      action: input.action,
      winProbability: context.winProbability,
      askCents: context.askCents,
      confidence: context.confidence,
      kellyFraction: config.kellyFraction,
      maxFraction: config.maxFraction,
      minFraction: config.minFraction,
      minEdgePercent: input.engineConfig.minEdgePercent,
      edgePercent: context.edgePercent,
    }),
  };
}

function resolveBankrollDollars(
  bankrollDollars: EstimatePositionSizeInput["bankrollDollars"],
  recommendedFraction: number,
): number | null {
  if (!isFiniteNumber(bankrollDollars) || bankrollDollars <= 0) {
    return null;
  }

  return bankrollDollars * recommendedFraction;
}

/**
 * Deterministic Kelly position sizing from policy action, probability, and EV.
 *
 * Applies fractional Kelly, confidence dampening, min-edge/min-size gates, and max cap.
 */
export function estimatePositionSize(
  input: EstimatePositionSizeInput,
  config: PositionSizingConfig = DEFAULT_POSITION_SIZING_CONFIG,
): PositionSizeEstimate {
  const side = actionToSide(input.action);
  const confidence = combinedConfidence(input.probability, input.expectedValue);
  const minEdgePercent = input.engineConfig.minEdgePercent;

  if (side === null) {
    return zeroEstimate(
      input,
      {
        side: null,
        rawKellyFraction: 0,
        cappedFraction: 0,
        confidence,
        winProbability: 0,
        askCents: null,
        edgePercent: 0,
      },
      config,
    );
  }

  if (!inputsAreValid(input)) {
    return zeroEstimate(
      input,
      {
        side,
        rawKellyFraction: 0,
        cappedFraction: 0,
        confidence,
        winProbability: 0,
        askCents: null,
        edgePercent: 0,
      },
      config,
    );
  }

  const metrics = sideMetrics(side, input.probability, input.expectedValue);
  const askCents = askFromFairAndEdge(metrics.fairCents, metrics.edgePercent);
  const rawKelly = askCents === null ? 0 : rawKellyFraction(metrics.winProbability, askCents);

  if (
    rawKelly <= 0 ||
    metrics.netEvCents <= 0 ||
    metrics.edgePercent < minEdgePercent
  ) {
    return zeroEstimate(
      input,
      {
        side,
        rawKellyFraction: Math.max(rawKelly, 0),
        cappedFraction: 0,
        confidence,
        winProbability: metrics.winProbability,
        askCents,
        edgePercent: metrics.edgePercent,
      },
      config,
    );
  }

  const dampened = rawKelly * config.kellyFraction * confidence;
  const capped = clampFraction(dampened, config.maxFraction);
  const recommendedFraction =
    capped >= config.minFraction ? capped : 0;

  const estimate: PositionSizeEstimate = {
    modelVersion: POSITION_SIZING_MODEL_VERSION,
    side,
    rawKellyFraction: rawKelly,
    cappedFraction: capped,
    recommendedFraction,
    recommendedPercent: recommendedFraction * 100,
    recommendedDollars: resolveBankrollDollars(
      input.bankrollDollars,
      recommendedFraction,
    ),
    reasoning: [],
  };

  return {
    ...estimate,
    reasoning: buildPositionSizingReasoning({
      ...estimate,
      action: input.action,
      winProbability: metrics.winProbability,
      askCents,
      confidence,
      kellyFraction: config.kellyFraction,
      maxFraction: config.maxFraction,
      minFraction: config.minFraction,
      minEdgePercent,
      edgePercent: metrics.edgePercent,
    }),
  };
}

export {
  DEFAULT_POSITION_SIZING_CONFIG,
  POSITION_SIZING_MODEL_VERSION,
} from "./config";

export type {
  EstimatePositionSizeInput,
  PositionSide,
  PositionSizeEstimate,
} from "./types";

export type { PositionSizingConfig } from "./config";

export { buildPositionSizingReasoning } from "./reasoning";
