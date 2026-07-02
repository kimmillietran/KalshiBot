import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import type { EvaluationPricingSnapshot } from "@/types/domain/trading";

import { BacktestLedger } from "./BacktestLedger";
import {
  computeFillCostBreakdown,
  resolveExecutionCostModel,
} from "./costModel";
import type { ResolvedExecutionCostModels } from "./costModel";
import {
  BacktestIntentRejectionCode,
  BacktestStrategyRunnerError,
  BacktestStrategyRunnerErrorCode,
} from "./errors";
import type { OpenPosition, TradeAction, TradeFillInput, TradeSide } from "./ledgerTypes";
import type {
  BacktestFillSimulationConfig,
  BacktestStepRunnerResult,
  BacktestStrategyContext,
  BacktestStrategyRunInput,
  BacktestStrategyRunResult,
  RejectedTradeIntent,
  SimulatedFill,
  TradeIntent,
} from "./strategyTypes";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "./strategyTypes";

function validateFillConfig(config: BacktestFillSimulationConfig): void {
  if (config.priceSource !== "engine-input-pricing") {
    throw new BacktestStrategyRunnerError(
      `Unsupported price source: ${config.priceSource}`,
      BacktestStrategyRunnerErrorCode.UNSUPPORTED_PRICE_SOURCE,
    );
  }

  if (config.allowPartialFills !== false) {
    throw new BacktestStrategyRunnerError(
      "Partial fills are not supported",
      BacktestStrategyRunnerErrorCode.UNSUPPORTED_PARTIAL_FILLS,
    );
  }

  if (!Number.isFinite(config.feeCentsPerContract) || config.feeCentsPerContract < 0) {
    throw new BacktestStrategyRunnerError(
      "feeCentsPerContract must be a non-negative finite number",
      BacktestStrategyRunnerErrorCode.INVALID_FILL_CONFIG,
    );
  }
}

function findOpenPosition(
  positions: readonly OpenPosition[],
  ticker: string,
  side: TradeSide,
): OpenPosition | null {
  return (
    positions.find(
      (position) => position.ticker === ticker && position.side === side,
    ) ?? null
  );
}

function resolveExecutionPriceCents(
  pricing: EvaluationPricingSnapshot,
  side: TradeSide,
  action: TradeAction,
): number | null {
  if (action === "buy") {
    return side === "yes" ? pricing.yesAskCents : pricing.noAskCents;
  }

  return side === "yes" ? pricing.yesBidCents : pricing.noBidCents;
}

function limitPriceAllowsFill(
  action: TradeAction,
  limitPriceCents: number,
  executionPriceCents: number,
): boolean {
  if (action === "buy") {
    return executionPriceCents <= limitPriceCents;
  }

  return executionPriceCents >= limitPriceCents;
}

function validateIntentShape(intent: TradeIntent): RejectedTradeIntent | null {
  if (!intent.ticker.trim()) {
    return {
      intentId: "",
      intent,
      code: BacktestIntentRejectionCode.INVALID_TICKER,
      reason: "Ticker is required",
    };
  }

  if (!Number.isInteger(intent.quantity) || intent.quantity <= 0) {
    return {
      intentId: "",
      intent,
      code: BacktestIntentRejectionCode.INVALID_QUANTITY,
      reason: "Quantity must be a positive integer",
    };
  }

  if (
    !Number.isInteger(intent.limitPriceCents) ||
    intent.limitPriceCents < 0 ||
    intent.limitPriceCents > 100
  ) {
    return {
      intentId: "",
      intent,
      code: BacktestIntentRejectionCode.INVALID_LIMIT_PRICE,
      reason: "limitPriceCents must be an integer between 0 and 100",
    };
  }

  return null;
}

function buildContext(stepIndex: number, ledger: BacktestLedger): BacktestStrategyContext {
  const ledgerSnapshot = ledger.snapshot();

  return {
    stepIndex,
    ledgerSnapshot,
    openPositions: ledgerSnapshot.openPositions,
    cashCents: ledgerSnapshot.cashCents,
  };
}

function simulateIntent(
  step: ReplayStepResult,
  intent: TradeIntent,
  intentId: string,
  fillId: string,
  context: BacktestStrategyContext,
  costModels: ResolvedExecutionCostModels,
): { fill: SimulatedFill } | { rejection: RejectedTradeIntent } {
  const shapeRejection = validateIntentShape(intent);
  if (shapeRejection) {
    return { rejection: { ...shapeRejection, intentId } };
  }

  if (intent.ticker !== step.sourceTicker) {
    return {
      rejection: {
        intentId,
        intent,
        code: BacktestIntentRejectionCode.TICKER_NOT_IN_STEP,
        reason: "Intent ticker must match replay step source ticker",
      },
    };
  }

  const pricing = step.engineInput.pricing;
  if (!pricing) {
    return {
      rejection: {
        intentId,
        intent,
        code: BacktestIntentRejectionCode.MISSING_PRICING,
        reason: "Replay step has no engine pricing snapshot",
      },
    };
  }

  const executionPriceCents = resolveExecutionPriceCents(
    pricing,
    intent.side,
    intent.action,
  );
  if (executionPriceCents === null) {
    return {
      rejection: {
        intentId,
        intent,
        code: BacktestIntentRejectionCode.MISSING_EXECUTION_PRICE,
        reason: `No ${intent.action} price available for ${intent.side}`,
      },
    };
  }

  if (!limitPriceAllowsFill(intent.action, intent.limitPriceCents, executionPriceCents)) {
    return {
      rejection: {
        intentId,
        intent,
        code: BacktestIntentRejectionCode.LIMIT_PRICE_NOT_MET,
        reason: "Limit price does not allow execution at current engine pricing",
      },
    };
  }

  const averageCostCents =
    intent.action === "sell"
      ? findOpenPosition(context.openPositions, intent.ticker, intent.side)
          ?.averageCostCents
      : undefined;
  const executionCost = computeFillCostBreakdown({
    action: intent.action,
    grossPriceCents: executionPriceCents,
    quantity: intent.quantity,
    models: costModels,
    averageCostCents,
  });
  const feeCents = executionCost.feeCents;
  const spreadSlippageCents = executionCost.spreadSlippageCents;
  const tradeCostCents = intent.quantity * executionPriceCents;
  const totalExecutionCostCents = feeCents + spreadSlippageCents;

  if (intent.action === "buy") {
    if (context.cashCents < tradeCostCents + totalExecutionCostCents) {
      return {
        rejection: {
          intentId,
          intent,
          code: BacktestIntentRejectionCode.INSUFFICIENT_CASH,
          reason: "Insufficient cash for simulated buy fill",
        },
      };
    }
  } else {
    const position = findOpenPosition(
      context.openPositions,
      intent.ticker,
      intent.side,
    );
    if (!position || position.quantity < intent.quantity) {
      return {
        rejection: {
          intentId,
          intent,
          code: BacktestIntentRejectionCode.INSUFFICIENT_POSITION,
          reason: "Insufficient open position for simulated sell fill",
        },
      };
    }
  }

  return {
    fill: {
      fillId,
      intentId,
      ticker: intent.ticker,
      side: intent.side,
      action: intent.action,
      priceCents: executionPriceCents,
      quantity: intent.quantity,
      feeCents,
      spreadSlippageCents,
      executionCost,
      occurredAt: step.engineInput.evaluatedAt,
      sourceStepIndex: step.stepIndex,
      reason: intent.reason,
    },
  };
}

function toTradeFillInput(fill: SimulatedFill): TradeFillInput {
  return {
    ticker: fill.ticker,
    side: fill.side,
    action: fill.action,
    priceCents: fill.priceCents,
    quantity: fill.quantity,
    feeCents: fill.feeCents,
    spreadSlippageCents: fill.spreadSlippageCents,
    executionCost: fill.executionCost,
    occurredAt: fill.occurredAt,
    sourceStepIndex: fill.sourceStepIndex,
  };
}

/** Converts replay step outputs into simulated fills and applies them to a ledger. */
export class BacktestStrategyRunner {
  static run(input: BacktestStrategyRunInput): BacktestStrategyRunResult {
    const fillConfig = input.fillConfig ?? DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG;
    const costModels = resolveExecutionCostModel(fillConfig, input.costModelConfig);

    validateFillConfig(fillConfig);

    let ledger = BacktestLedger.create(input.initialCashCents);
    const stepResults: BacktestStepRunnerResult[] = [];
    let nextIntentSequence = 1;
    let nextFillSequence = 1;

    for (const step of input.steps) {
      const context = buildContext(step.stepIndex, ledger);
      const intents = input.strategy.decide(step, context);
      const acceptedFills: SimulatedFill[] = [];
      const rejectedIntents: RejectedTradeIntent[] = [];

      for (const intent of intents) {
        const intentId = `intent-${String(nextIntentSequence).padStart(6, "0")}`;
        nextIntentSequence += 1;

        const fillId = `sim-fill-${String(nextFillSequence).padStart(6, "0")}`;
        const simulation = simulateIntent(
          step,
          intent,
          intentId,
          fillId,
          context,
          costModels,
        );

        if ("rejection" in simulation) {
          rejectedIntents.push(simulation.rejection);
          continue;
        }

        nextFillSequence += 1;
        acceptedFills.push(simulation.fill);
        ledger = ledger.recordFill(toTradeFillInput(simulation.fill));
      }

      stepResults.push({
        stepIndex: step.stepIndex,
        intents,
        acceptedFills,
        rejectedIntents,
      });
    }

    return {
      strategyId: input.strategy.strategyId,
      ledger,
      steps: stepResults,
    };
  }
}
