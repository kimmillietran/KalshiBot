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

/** Decision JSON export — presentation copy only. */
export const DECISION_EXPORT_BUTTON_LABEL = "Copy Decision JSON";

export const DECISION_EXPORT_COPIED_LABEL = "Copied";

export const DECISION_EXPORT_ERROR_LABEL = "Copy failed";

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

/** Trading settings panel — presentation copy only. */
export const TRADING_SETTINGS_PANEL_TITLE = "Trading Settings";

export const TRADING_SETTINGS_PANEL_SUBTITLE =
  "Session-only configuration — changes apply immediately to the live engine.";

export const TRADING_SETTINGS_FIELD_COPY = {
  bankrollDollars: {
    label: "Bankroll ($)",
    helper: "Optional. Required for Kelly dollar recommendations.",
  },
  minEdgePercent: {
    label: "Minimum Edge %",
    helper: "Minimum modeled edge required before a trade qualifies.",
  },
  maxSpreadPercent: {
    label: "Maximum Spread %",
    helper: "Guard threshold for acceptable bid-ask spread.",
  },
  kellyFraction: {
    label: "Kelly Fraction",
    helper: "Fractional Kelly multiplier applied to full Kelly sizing.",
  },
  maxPositionFraction: {
    label: "Maximum Position %",
    helper: "Hard cap on recommended bankroll allocation (0–1).",
  },
} as const;
