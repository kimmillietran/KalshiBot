import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting";
import type { BuildHistoricalResearchFixtureFromImportResultInput } from "@/lib/data/importJobs/fixtureBridge";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";

import type { BatchFixtureBridgeOptions } from "./batchFixtureBridgeTypes";

export const DEFAULT_BATCH_FIXTURE_BRIDGE_DURATION_MS = 4_000;
export const DEFAULT_BATCH_FIXTURE_BRIDGE_INITIAL_CASH_CENTS = 10_000;

/** Deterministic default bridge options for batch fixture generation. */
export function buildDefaultBatchFixtureBridgeOptions(
  marketTicker: string,
  overrides: BatchFixtureBridgeOptions = {},
): Omit<BuildHistoricalResearchFixtureFromImportResultInput, "importResult"> {
  return {
    strategyId: overrides.strategyId ?? "noop",
    runId: overrides.runId ?? `fixture-${marketTicker}`,
    durationMs: overrides.durationMs ?? DEFAULT_BATCH_FIXTURE_BRIDGE_DURATION_MS,
    initialCashCents:
      overrides.initialCashCents ?? DEFAULT_BATCH_FIXTURE_BRIDGE_INITIAL_CASH_CENTS,
    engineConfig: overrides.engineConfig ?? DEFAULT_ENGINE_CONFIG,
    fillConfig: overrides.fillConfig ?? DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
    metricsConfig: overrides.metricsConfig,
    exportConfig: overrides.exportConfig,
  };
}
