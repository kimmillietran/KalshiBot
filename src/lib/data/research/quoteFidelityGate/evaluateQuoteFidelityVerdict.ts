import type {
  LadderFeasibilitySummary,
  QuoteFidelityGateConfig,
  QuoteFidelityGateVerdict,
  QuoteFidelityRecommendedNextAction,
  QuoteFidelitySummary,
} from "./quoteFidelityGateTypes";

export function evaluateQuoteFidelityVerdict(input: {
  config: QuoteFidelityGateConfig;
  quoteFidelity: QuoteFidelitySummary;
  ladder: LadderFeasibilitySummary;
  marketCount: number;
}): {
  verdict: QuoteFidelityGateVerdict;
  recommendedNextAction: QuoteFidelityRecommendedNextAction;
} {
  if (input.marketCount === 0) {
    return {
      verdict: "blocked-insufficient-data",
      recommendedNextAction: "no-action-current-corpus-insufficient",
    };
  }

  if (input.ladder.eventCount === 0) {
    return {
      verdict: "blocked-missing-event-metadata",
      recommendedNextAction: "no-action-current-corpus-insufficient",
    };
  }

  if (input.ladder.eventsWith2PlusStrikes === 0) {
    return {
      verdict: "blocked-no-ladder",
      recommendedNextAction:
        input.quoteFidelity.liveCloseOnlyQuoteShare
        >= input.config.highLiveCloseOnlyShareThreshold
        || input.quoteFidelity.zeroSpreadMarketShare
        >= input.config.highZeroSpreadShareThreshold
          ? "start-forward-live-quote-capture"
          : "build-lead-lag-close-proxy-diagnostic",
    };
  }

  if (
    input.quoteFidelity.liveCloseOnlyQuoteShare
    >= input.config.highLiveCloseOnlyShareThreshold
    || input.quoteFidelity.zeroSpreadMarketShare
    >= input.config.highZeroSpreadShareThreshold
  ) {
    return {
      verdict: "blocked-close-only-quotes",
      recommendedNextAction: "start-forward-live-quote-capture",
    };
  }

  if (!input.quoteFidelity.executableParityResearchFeasible) {
    return {
      verdict: "blocked-needs-live-quotes",
      recommendedNextAction: "start-forward-live-quote-capture",
    };
  }

  if (input.ladder.eventsWith2PlusStrikes > 0) {
    return {
      verdict: "proceed-cross-strike-ladder",
      recommendedNextAction: "proceed-m12.1-cross-strike-ladder",
    };
  }

  return {
    verdict: "proceed-static-parity",
    recommendedNextAction: "proceed-m12.1-static-parity",
  };
}
