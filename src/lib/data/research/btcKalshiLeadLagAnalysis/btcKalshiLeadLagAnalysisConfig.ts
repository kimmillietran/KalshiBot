import type { BtcKalshiLeadLagAnalysisConfig } from "./btcKalshiLeadLagAnalysisTypes";

export const DEFAULT_BTC_KALSHI_LEAD_LAG_ANALYSIS_CONFIG: Omit<
  BtcKalshiLeadLagAnalysisConfig,
  "captureRunDir"
> = {
  maximumBtcJoinAgeMs: 5_000,
  responseMatchToleranceMs: 1_500,
  triggerCooldownMs: 30_000,
  stalenessBoundMs: 5_000,
  minimumTriggersForClassification: 20,
  minimumEligibleTriggersForStrongClassification: 100,
  eventsOutputPath: "data/research-results/btc-kalshi-lead-lag-events.jsonl",
};

export function createBtcKalshiLeadLagAnalysisConfig(
  overrides: Partial<BtcKalshiLeadLagAnalysisConfig>
    & Pick<BtcKalshiLeadLagAnalysisConfig, "captureRunDir">,
): BtcKalshiLeadLagAnalysisConfig {
  return {
    ...DEFAULT_BTC_KALSHI_LEAD_LAG_ANALYSIS_CONFIG,
    ...overrides,
  };
}
