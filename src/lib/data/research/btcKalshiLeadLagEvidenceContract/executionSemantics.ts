import type {
  LeadLagEstimandContract,
  LeadLagExecutionSemantics,
  LeadLagSecondaryDiagnosticId,
} from "./leadLagEvidenceContractTypes";

export const DEFAULT_LEAD_LAG_QUOTE_STALENESS_BOUND_MS = 5_000;

export function buildLeadLagEstimandContract(): LeadLagEstimandContract {
  const secondaryDiagnostics: readonly LeadLagSecondaryDiagnosticId[] = [
    "signed-executable-ask-response-cents",
    "directional-response-share",
    "spread-change-cents",
  ];
  return {
    primaryEstimand: "signed-yes-mid-response-cents",
    primaryEstimandRationale:
      "Pre-validation, the generic statistical estimand is the signed yes-mid response at the "
      + "locked response horizon (diagnostic lead-lag association). Midpoint movement is NOT trading profit.",
    secondaryDiagnostics,
    midpointDistinctFromExecutablePnl: true,
    executablePnlStatus: "not-yet-faithful-primary",
    nextRequiredEvidenceForExecutablePnl:
      "Faithful one-contract TOB entry/exit with spread, explicit fee schedule, side-consistent "
      + "quotes, and non-stale executable visibility before elevating executable PnL to primary.",
  };
}

export function buildLeadLagExecutionSemantics(): LeadLagExecutionSemantics {
  return {
    fillModel: "one-contract-tob-observable-only",
    entryPriceField: "executableBuyYesCents",
    exitOrResponsePriceField: "executableSellYesCents",
    spreadCostField: "spreadCents",
    feeAssumption:
      "Fee schedule not frozen in this prep contract; any economic claim must declare fees explicitly "
      + "before promotion. Do not assume zero fees.",
    sideConsistencyRule:
      "Entry and response must use the same contract side (yes) and must not mix mid with executable.",
    quoteStalenessBoundMs: DEFAULT_LEAD_LAG_QUOTE_STALENESS_BOUND_MS,
    minimumExecutableVisibility:
      "Both best bid and best ask (hence executableBuyYesCents and executableSellYesCents) must be present "
      + "at entry and at the locked response timestamp.",
    missingBidAskPolicy: "fail-executable-evidence",
    staleQuotePolicy: "fail-executable-observability",
    assumesFillBeyondTobLiquidity: false,
    liveOrdersImplemented: false,
  };
}

export type ExecutableObservabilityInput = {
  bestBidCents: number | null;
  bestAskCents: number | null;
  executableBuyYesCents: number | null;
  executableSellYesCents: number | null;
  quoteAgeMs: number | null;
  stalenessBoundMs: number;
};

export type ExecutableObservabilityResult = {
  satisfies: boolean;
  reasons: readonly string[];
};

export function assessExecutableObservability(
  input: ExecutableObservabilityInput,
): ExecutableObservabilityResult {
  const reasons: string[] = [];
  if (input.bestBidCents === null || input.bestAskCents === null) {
    reasons.push("missing bid/ask fails executable evidence requirement");
  }
  if (input.executableBuyYesCents === null || input.executableSellYesCents === null) {
    reasons.push("missing executable buy/sell yes cents");
  }
  if (input.quoteAgeMs === null) {
    reasons.push("missing quote age cannot prove non-staleness");
  } else if (input.quoteAgeMs > input.stalenessBoundMs) {
    reasons.push("stale executable quote cannot satisfy observability");
  }
  return {
    satisfies: reasons.length === 0,
    reasons,
  };
}
