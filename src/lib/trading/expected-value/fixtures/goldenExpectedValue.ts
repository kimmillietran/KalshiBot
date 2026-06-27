import type { ExpectedValueEstimate } from "../types";

/** Golden fixture for regression — P(up)=0.74 vs 63¢ YES ask. */
export const goldenExpectedValueEstimate: ExpectedValueEstimate = {
  modelVersion: "5.5.0",
  evYesCents: 11,
  evNoCents: -11,
  netEvYesCents: 11,
  netEvNoCents: -11,
  fairYesCents: 74,
  fairNoCents: 26,
  edgeYesPercent: 17.46031746031746,
  edgeNoPercent: -29.629629629629626,
  bestSide: "yes",
  bestEvCents: 11,
  confidence: 0.8,
  reasoning: {
    summary: "Expected value — YES +11.00¢",
    lines: [
      "fair YES 74.00¢ · fair NO 26.00¢",
      "EV YES +11.00¢ · EV NO -11.00¢",
      "edge YES +17.46% · edge NO -29.63%",
      "best=yes +11.00¢",
      "confidence=80%",
    ],
  },
};
