import type { ReasoningPresentationConfig } from "./types";

export const DEFAULT_REASONING_PRESENTATION_CONFIG: ReasoningPresentationConfig = {
  headlineBuyUp: "Bullish outlook — BUY UP",
  headlineBuyDown: "Bearish outlook — BUY DOWN",
  headlineNoTradePolicy: "No trade — policy withheld signal",
  headlineNoTradeGuard: "No trade — guard blocked evaluation",
  headlineHold: "No trade — hold",
  executionDisabledNote:
    "Automated execution is not enabled — review before any manual trade.",
  probabilityUnavailableNote:
    "Probability estimate unavailable — evaluation stopped before the model step.",
  expectedValueUnavailableNote:
    "Expected value unavailable — evaluation stopped before the EV step.",
  featuresUnavailableNote:
    "Feature vector unavailable — evaluation stopped before feature extraction.",
};

export const REASONING_PRESENTATION_MODEL_VERSION = "5.8.0";

/** Stable human labels for known engine step ids. */
export const REASONING_STEP_LABELS: Record<string, string> = {
  "guard-config-enabled": "Engine enabled",
  "guard-market-present": "Market present",
  "guard-market-lifecycle": "Market lifecycle",
  "guard-strike-present": "Strike present",
  "guard-contract-expired": "Contract expiry",
  "guard-settlement-window": "Settlement window",
  "guard-btc-present": "BTC feed present",
  "guard-btc-feed-loading": "BTC feed loading",
  "guard-btc-feed-error": "BTC feed error",
  "guard-btc-feed-stale": "BTC feed stale",
  "guard-btc-fallback-source": "BTC fallback source",
  "guard-btc-candles": "BTC candles",
  "guard-pricing-present": "Pricing present",
  "guard-liquidity-minimum": "Liquidity minimum",
  "guard-spread-maximum": "Spread maximum",
  "feature-extraction": "Feature extraction",
  "model-probability": "Probability model",
  "model-expected-value": "Expected value",
  "decision-policy": "Decision policy",
  "model-position-sizing": "Position sizing",
};
