import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import {
  extractDayOfWeekUtc,
  extractHourUtc,
  extractSessionBucketCode,
  extractWeekendFlag,
  integerFitsBucket,
} from "./temporalBucketDefinitions";
import type { ResearchDimensionId } from "./types";

/** Extracts a numeric dimension value from a mispricing observation. */
export function extractDimensionValue(
  dimensionId: ResearchDimensionId,
  observation: MispricingObservation,
): number | null {
  switch (dimensionId) {
    case "probability":
    case "coarseProbability":
    case "coarseProbabilityAxis":
      return observation.predictedProbability;
    case "timeRemaining":
    case "coarseTimeRemaining":
      return observation.timeRemainingMs;
    case "moneyness":
      return observation.moneynessPercent;
    case "volatility":
      return observation.annualizedVolatility;
    case "momentum15m":
      return observation.momentumPercent;
    case "hourUtc":
      return extractHourUtc(observation);
    case "dayOfWeekUtc":
      return extractDayOfWeekUtc(observation);
    case "sessionBucket":
      return extractSessionBucketCode(observation);
    case "weekendFlag":
      return extractWeekendFlag(observation);
    default:
      return null;
  }
}

export { integerFitsBucket };
