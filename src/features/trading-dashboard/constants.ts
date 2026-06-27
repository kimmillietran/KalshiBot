/** Copy when the decision engine is connected to live feeds. */
export const DECISION_ENGINE_CONNECTED_MESSAGE = "Live engine evaluation";

/** @deprecated Use DECISION_ENGINE_CONNECTED_MESSAGE */
export const DECISION_ENGINE_PENDING_MESSAGE = DECISION_ENGINE_CONNECTED_MESSAGE;

export const PROBABILITY_UNAVAILABLE_MESSAGE =
  "Probability estimate unavailable — evaluation stopped before the model step.";

export const EXPECTED_VALUE_UNAVAILABLE_MESSAGE =
  "Expected value unavailable — evaluation stopped before the EV step.";

export const EXECUTION_DISABLED_MESSAGE =
  "Trade execution is not enabled in this dashboard.";

export const REASONING_ENGINE_ONLY_MESSAGE =
  "Reasoning trace from the deterministic engine pipeline (guards → features → probability → EV → policy).";

export const FEATURES_UNAVAILABLE_MESSAGE =
  "Feature vector unavailable — evaluation stopped before feature extraction.";

/** Shown when evaluation stops before the sizing step. */
export const POSITION_SIZING_UNAVAILABLE_MESSAGE =
  "Evaluation stopped before sizing.";

export const POSITION_SIZING_ZERO_REASON = "No qualifying trade";

export const POSITION_SIZING_DOLLARS_UNAVAILABLE_LABEL =
  "Bankroll not configured";

export const POSITION_SIZING_RECOMMENDED_POSITION_LABEL = "Recommended Position";

export const POSITION_SIZING_ZERO_ALLOCATION_MESSAGE =
  "Zero recommended allocation";

export const POSITION_SIZING_RECOMMENDED_ALLOCATION_MESSAGE =
  "Recommended position";
