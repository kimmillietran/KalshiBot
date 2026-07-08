import type { PnlForensicsGateConfig } from "./pnlForensicsGateTypes";

export const DERIVED_SETTLEMENT_SENSITIVE_MONTHS = ["2025-12"] as const;

export const DEFAULT_PNL_FORENSICS_GATE_CONFIG: PnlForensicsGateConfig = {
  topDayMaxShareOfPositivePnl: 0.5,
  top3DayMaxShareOfPositivePnl: 0.8,
  topMarketMaxShareOfTotalPnl: 0.4,
  topMonthMaxShareOfTotalPnl: 0.4,
  maxSideShareOfPositivePnl: 0.9,
  minPositiveCalendarMonths: 2,
  minPositiveTradingDays: 5,
  repeatedEntryTradesPerMarketWarning: 10,
  minFilledTradesForAnalysis: 1,
};

export const PNL_FORENSICS_GATE_DISCLAIMER =
  "In-sample PnL forensics gate only. This report decomposes M11.6 replay PnL to check whether positive results are broad or concentrated. This is not out-of-sample evidence and does not validate a strategy.";

export const PNL_FORENSICS_GATE_CAVEATS = [
  "This is in-sample forensics only.",
  "This does not prove alpha.",
  "This does not test out-of-sample PnL.",
  "This does not model queue position, latency, partial fills, or adverse selection.",
  "Repeated step-level trades are not independent.",
  "A pass only clears the family for the next OOS PnL experiment.",
  "A pause means investigate concentration before M12 — not proof the family is dead.",
] as const;

export function createPnlForensicsGateConfig(
  overrides?: Partial<PnlForensicsGateConfig>,
): PnlForensicsGateConfig {
  return {
    ...DEFAULT_PNL_FORENSICS_GATE_CONFIG,
    ...overrides,
  };
}
