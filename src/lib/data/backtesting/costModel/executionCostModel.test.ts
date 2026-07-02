import { describe, expect, it } from "vitest";

import { computeBacktestMetrics } from "../BacktestMetrics";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "../strategyTypes";
import { buildFillExecutionCostFields } from "./buildFillExecutionCostFields";
import { computeExecutionCostSummary } from "./computeExecutionCostSummary";
import { computeFillCostBreakdown } from "./computeFillCostBreakdown";
import {
  ExecutionCostModelError,
  ExecutionCostModelErrorCode,
} from "./executionCostModelErrors";
import { resolveExecutionCostModel } from "./resolveExecutionCostModel";
import { validateExecutionCostModelConfig } from "./validateExecutionCostModelConfig";

describe("execution cost model", () => {
  it("defaults to zero-cost when no config is provided", () => {
    const models = resolveExecutionCostModel(DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG);
    const breakdown = computeFillCostBreakdown({
      action: "buy",
      grossPriceCents: 50,
      quantity: 10,
      models,
    });

    expect(breakdown).toEqual({
      grossPriceCents: 50,
      feeCents: 0,
      spreadSlippageCents: 0,
      netCostCents: 500,
      netProceedsCents: -500,
      netPnlContributionCents: null,
    });
  });

  it("uses legacy fillConfig fee when costModelConfig is absent", () => {
    const models = resolveExecutionCostModel({
      ...DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
      feeCentsPerContract: 2,
    });
    const breakdown = computeFillCostBreakdown({
      action: "buy",
      grossPriceCents: 50,
      quantity: 10,
      models,
    });

    expect(breakdown.feeCents).toBe(20);
    expect(breakdown.netCostCents).toBe(520);
  });

  it("applies per-contract fee model from costModelConfig", () => {
    const models = resolveExecutionCostModel(DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG, {
      executionCostModel: { kind: "per-contract-fee", feeCentsPerContract: 3 },
    });
    const breakdown = computeFillCostBreakdown({
      action: "sell",
      grossPriceCents: 55,
      quantity: 4,
      models,
      averageCostCents: 50,
    });

    expect(breakdown.feeCents).toBe(12);
    expect(breakdown.netProceedsCents).toBe(208);
    expect(breakdown.netPnlContributionCents).toBe(8);
  });

  it("rejects invalid negative fee config", () => {
    expect(() =>
      validateExecutionCostModelConfig({
        executionCostModel: { kind: "per-contract-fee", feeCentsPerContract: -1 },
      }),
    ).toThrow(ExecutionCostModelError);

    try {
      validateExecutionCostModelConfig({
        executionCostModel: { kind: "per-contract-fee", feeCentsPerContract: -1 },
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: ExecutionCostModelErrorCode.INVALID_FEE,
      });
    }
  });

  it("builds per-fill execution cost fields for legacy fills", () => {
    const fields = buildFillExecutionCostFields({
      action: "buy",
      priceCents: 48,
      quantity: 5,
      feeCents: 10,
      fillConfig: {
        feeCentsPerContract: 2,
        allowPartialFills: false,
        priceSource: "engine-input-pricing",
      },
    });

    expect(fields.executionCost.feeCents).toBe(10);
    expect(fields.spreadSlippageCents).toBe(0);
  });

  it("aggregates gross vs net PnL from fills", () => {
    const buy = buildFillExecutionCostFields({
      action: "buy",
      priceCents: 50,
      quantity: 10,
      feeCents: 20,
      fillConfig: {
        feeCentsPerContract: 2,
        allowPartialFills: false,
        priceSource: "engine-input-pricing",
      },
    });
    const sell = buildFillExecutionCostFields({
      action: "sell",
      priceCents: 60,
      quantity: 10,
      feeCents: 20,
      averageCostCents: 50,
      fillConfig: {
        feeCentsPerContract: 2,
        allowPartialFills: false,
        priceSource: "engine-input-pricing",
      },
    });

    const summary = computeExecutionCostSummary(
      [
        { action: "buy", ...buy },
        { action: "sell", ...sell },
      ],
      60,
    );

    expect(summary.totalFeesCents).toBe(40);
    expect(summary.totalSpreadCostCents).toBe(0);
    expect(summary.netPnlCents).toBe(60);
    expect(summary.grossPnlCents).toBe(100);
    expect(summary.feesAsPercentOfGrossPnl).toBe(40);
  });

  it("returns null feesAsPercentOfGrossPnl when gross PnL is zero", () => {
    const summary = computeExecutionCostSummary(
      [{ action: "buy", feeCents: 5, spreadSlippageCents: 0 }],
      -5,
    );

    expect(summary.grossPnlCents).toBe(0);
    expect(summary.feesAsPercentOfGrossPnl).toBeNull();
  });

  it("defaults cost metrics when fills are omitted", () => {
    const metrics = computeBacktestMetrics({
      equityCurve: [
        { stepIndex: 0, timestamp: "2026-06-26T23:15:00.000Z", equityCents: 100_000 },
        { stepIndex: 1, timestamp: "2026-06-26T23:30:00.000Z", equityCents: 110_000 },
      ],
      closedTrades: [],
    });

    expect(metrics.totalFeesCents).toBe(0);
    expect(metrics.totalSpreadCostCents).toBe(0);
    expect(metrics.grossPnlCents).toBe(10_000);
    expect(metrics.netPnlCents).toBe(10_000);
    expect(metrics.feesAsPercentOfGrossPnl).toBeNull();
  });

  it("zero-cost costModelConfig overrides legacy fillConfig fees", () => {
    const models = resolveExecutionCostModel(
      { ...DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG, feeCentsPerContract: 5 },
      { executionCostModel: { kind: "zero" } },
    );

    expect(models.executionFeeModel).toEqual({ kind: "zero" });
  });
});
