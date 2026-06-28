import { DECISION_POLICY_MODEL_VERSION } from "@/lib/trading/decision-policy/config";

export const ENGINE_SNAPSHOT_MODEL_VERSION = "5.11.0";

export const SNAPSHOT_UNAVAILABLE_LABEL = "unavailable";

/** Stable headline labels keyed by engine action. */
export const SNAPSHOT_HEADLINES: Record<string, string> = {
  "BUY UP": "Engine snapshot — BUY UP",
  "BUY DOWN": "Engine snapshot — BUY DOWN",
  "NO TRADE": "Engine snapshot — NO TRADE",
  HOLD: "Engine snapshot — HOLD",
};

export const SNAPSHOT_STEP_LABELS: Record<string, string> = {
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
  "model-bankroll": "Bankroll resolution",
  "model-position-sizing": "Position sizing",
};

export const SNAPSHOT_POLICY_VERSION = DECISION_POLICY_MODEL_VERSION;
