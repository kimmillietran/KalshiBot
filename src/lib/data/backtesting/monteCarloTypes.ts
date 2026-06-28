import type { ClosedTradeSummary } from "./metricsTypes";

export const ResampleMode = {
  BOOTSTRAP: "bootstrap",
  PERMUTATION: "permutation",
} as const;

export type ResampleMode = (typeof ResampleMode)[keyof typeof ResampleMode];

export type MonteCarloConfig = {
  simulationCount: number;
  resampleMode: ResampleMode;
  startingEquityCents: number;
  /** Deterministic seed supplied by the caller — never generated internally. */
  seed: number;
};

export type DeterministicIndexContext = {
  seed: number;
  simulationIndex: number;
  drawIndex: number;
  upperBound: number;
};

/** Injected deterministic index generator — no Math.random(). */
export type DeterministicIndexGenerator = (
  context: DeterministicIndexContext,
) => number;

export type MonteCarloRun = {
  simulationIndex: number;
  endingEquityCents: number;
  maxDrawdownPct: number;
  totalReturnPct: number;
};

export type MonteCarloSummary = {
  simulations: readonly MonteCarloRun[];
  medianEndingEquity: number;
  meanEndingEquity: number;
  worstEndingEquity: number;
  bestEndingEquity: number;
  percentile5: number;
  percentile25: number;
  percentile50: number;
  percentile75: number;
  percentile95: number;
  averageDrawdownPct: number;
  worstDrawdownPct: number;
};

export type RunMonteCarloAnalysisInput = {
  closedTrades: readonly ClosedTradeSummary[];
  config: MonteCarloConfig;
  indexGenerator?: DeterministicIndexGenerator;
};

export type ResampledTradeSequence = readonly ClosedTradeSummary[];
