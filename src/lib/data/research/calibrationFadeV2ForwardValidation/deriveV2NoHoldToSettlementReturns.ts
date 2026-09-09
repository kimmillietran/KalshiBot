import { computeFillCostBreakdown } from "@/lib/data/backtesting/costModel/computeFillCostBreakdown";
import { resolveExecutionCostModel } from "@/lib/data/backtesting/costModel/resolveExecutionCostModel";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";

/**
 * Frozen v2 NO-side hold-to-settlement gross return for one contract.
 * Wins when settled outcome is NO: 100 - entryPriceCents; otherwise -entryPriceCents.
 */
export function computeV2NoHoldToSettlementGrossReturnCents(
  entryPriceCents: number,
  settledOutcome: "yes" | "no",
): number {
  const wins = settledOutcome === "no";
  return wins ? 100 - entryPriceCents : -entryPriceCents;
}

/** Same per-contract fee model used by the single-run v2 forward evaluator. */
export function resolveV2ForwardExecutionCostModels() {
  return resolveExecutionCostModel(DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG, {
    executionCostModel: { kind: "per-contract-fee", feeCentsPerContract: 1 },
  });
}

/**
 * Deterministic executable returns for frozen v2 NO ask / hold-to-settlement.
 * Returns remain null when settlement is unknown or executable entry price is unavailable.
 */
export function deriveV2NoHoldToSettlementReturns(input: {
  noAskCents: number | null;
  executableAvailable: boolean;
  settledOutcome: string;
}): {
  grossReturnCents: number | null;
  feeAdjustedReturnCents: number | null;
} {
  const settledOutcome = input.settledOutcome;
  const canEvaluate =
    input.executableAvailable
    && input.noAskCents !== null
    && Number.isFinite(input.noAskCents)
    && (settledOutcome === "yes" || settledOutcome === "no");

  if (!canEvaluate) {
    return {
      grossReturnCents: null,
      feeAdjustedReturnCents: null,
    };
  }

  const grossReturnCents = computeV2NoHoldToSettlementGrossReturnCents(
    input.noAskCents as number,
    settledOutcome,
  );
  const fee = computeFillCostBreakdown({
    action: "buy",
    grossPriceCents: input.noAskCents as number,
    quantity: 1,
    models: resolveV2ForwardExecutionCostModels(),
  });
  return {
    grossReturnCents,
    feeAdjustedReturnCents: grossReturnCents - fee.feeCents,
  };
}
