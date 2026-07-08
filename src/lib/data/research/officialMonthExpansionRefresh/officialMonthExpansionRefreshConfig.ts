import { DERIVED_SETTLEMENT_SENSITIVE_MONTHS } from "@/lib/data/research/pnlForensicsGate";

import type { OfficialMonthExpansionRefreshConfig } from "./officialMonthExpansionRefreshTypes";

export const OFFICIAL_MONTH_EXPANSION_REFRESH_DISCLAIMER =
  "Official month expansion / calibration-fade evidence refresh. This operational milestone audits coverage, may import additional official months, and reruns the existing evidence chain. It does not validate a strategy or authorize live trading.";

export const OFFICIAL_MONTH_EXPANSION_REFRESH_CAVEATS = [
  "This is an operational coverage/evidence refresh report, not alpha proof.",
  "Audit-only mode (default) refreshes the expansion plan but does not import new data.",
  "Evidence is unchanged unless --execute-import and evidence-chain reruns complete successfully.",
  "Import success does not guarantee broader PnL.",
  "Derived-sensitive month 2025-12 is excluded from official-month expansion targets.",
  "A pivot recommendation means stop squeezing calibration-fade and audit a new family.",
  "Thresholds are not tuned to force a proceed verdict.",
] as const;

export const DEFAULT_OFFICIAL_MONTH_EXPANSION_REFRESH_CONFIG: OfficialMonthExpansionRefreshConfig =
  {
    sensitiveMonth: DERIVED_SETTLEMENT_SENSITIVE_MONTHS[0] ?? "2025-12",
    minOfficialPositiveMonths: 3,
    topMonthMaxShare: 0.6,
    minUniqueTradingDayIncrease: 0,
  };

export function createOfficialMonthExpansionRefreshConfig(
  overrides?: Partial<OfficialMonthExpansionRefreshConfig>,
): OfficialMonthExpansionRefreshConfig {
  return {
    ...DEFAULT_OFFICIAL_MONTH_EXPANSION_REFRESH_CONFIG,
    ...overrides,
  };
}

export const EVIDENCE_CHAIN_COMMANDS = [
  "npm run research:hypotheses",
  "npm run research:hypothesis-validation",
  "npm run research:cost-aware-atlas",
  "npm run research:hypothesis-trade-replay",
  "npm run research:oos-power-correction",
  "npm run research:family-verdict",
  "npm run research:pnl-forensics",
  "npm run research:derived-month-pnl-sensitivity",
] as const;
