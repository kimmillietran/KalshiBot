/**
 * TEST-ONLY in-memory reference for locked-candidate validation outcomes.
 * Never use against real accepted M14 validation captures.
 */
import {
  applyRefractoryEpisodeFilter,
  computeGrossExecutableOneContractPnlCents,
  detectFirstMomentumCrossings,
  diagnosticSignedMidpointContinuationCents,
  matchResponseQuote,
  midpointFromQuote,
  RESPONSE_MATCH_TOLERANCE_MS,
  utcTradingDayFromTimestampMs,
  type MomentumQuoteInput,
} from "../kalshiTobMomentumFamily";
import {
  LOCKED_MOMENTUM_VALIDATION_CANDIDATE,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
} from "../kalshiTobMomentumValidationCohort";

import type { SyntheticValidationEpisode } from "./momentumValidationTypes";

function isOneContractExecutable(quote: MomentumQuoteInput): boolean {
  return (
    quote.yesBestBidSize != null
    && quote.noBestBidSize != null
    && quote.yesBestBidSize >= 1
    && quote.noBestBidSize >= 1
  );
}

/**
 * Load-all-quotes reference implementation for equivalence tests only.
 */
export function referenceLockedCandidateValidationOutcomes(input: {
  quotes: readonly MomentumQuoteInput[];
  closeTimeByMarket: ReadonlyMap<string, number>;
  responseMatchToleranceMs?: number;
}): {
  episodes: SyntheticValidationEpisode[];
  keys: {
    marketTicker: string;
    tradingDayUtc: string;
    eventTimestampMs: number;
    responseTimestampMs: number | null;
    responseObservable: boolean;
    executableObservable: boolean;
    signedExecutablePnlCents: number | null;
    signedMidpointContinuationCents: number | null;
  }[];
} {
  const toleranceMs = input.responseMatchToleranceMs ?? RESPONSE_MATCH_TOLERANCE_MS;
  const candidate = LOCKED_MOMENTUM_VALIDATION_CANDIDATE;

  const { events } = detectFirstMomentumCrossings({
    quotes: input.quotes,
    backwardWindowMs: candidate.lookbackWindowMs,
    returnThresholdCents: candidate.thresholdCents,
    forwardHorizonMs: candidate.responseHorizonMs,
    resolveTimeRemainingMs: (quote) => {
      const close = input.closeTimeByMarket.get(quote.marketTicker);
      if (close == null) return null;
      return Math.max(close - quote.timestampMs, 0);
    },
    resolveCloseTimeMs: (quote) => input.closeTimeByMarket.get(quote.marketTicker) ?? null,
  });

  const { accepted } = applyRefractoryEpisodeFilter({
    events,
    forwardHorizonMs: candidate.responseHorizonMs,
  });

  const quotesByMarket = new Map<string, MomentumQuoteInput[]>();
  for (const quote of [...input.quotes].sort((a, b) => a.timestampMs - b.timestampMs)) {
    const list = quotesByMarket.get(quote.marketTicker) ?? [];
    list.push(quote);
    quotesByMarket.set(quote.marketTicker, list);
  }

  const episodes: SyntheticValidationEpisode[] = [];
  const keys: {
    marketTicker: string;
    tradingDayUtc: string;
    eventTimestampMs: number;
    responseTimestampMs: number | null;
    responseObservable: boolean;
    executableObservable: boolean;
    signedExecutablePnlCents: number | null;
    signedMidpointContinuationCents: number | null;
  }[] = [];

  for (const event of accepted) {
    const marketQuotes = quotesByMarket.get(event.marketTicker) ?? [];
    const eventQuote = marketQuotes.find((q) => q.timestampMs === event.eventTimestampMs);
    const closeTimeMs = input.closeTimeByMarket.get(event.marketTicker) ?? null;
    const matched = matchResponseQuote({
      eventTimestampMs: event.eventTimestampMs,
      forwardHorizonMs: candidate.responseHorizonMs,
      responseQuotes: marketQuotes,
      closeTimeMs,
      toleranceMs,
    });

    const tradingDayUtc = utcTradingDayFromTimestampMs(event.eventTimestampMs);
    let signedExec: number | null = null;
    let signedMid: number | null = null;
    let responseObservable = false;
    let executableObservable = false;
    let responseTimestampMs: number | null = null;

    if (matched.status === "observed" && eventQuote) {
      responseObservable = true;
      responseTimestampMs = matched.matchedQuoteTimestampMs;
      const responseQuote = marketQuotes.find(
        (q) => q.timestampMs === matched.matchedQuoteTimestampMs,
      );
      if (responseQuote) {
        const exitMid = midpointFromQuote(responseQuote);
        if (exitMid != null) {
          signedMid = diagnosticSignedMidpointContinuationCents({
            continuationSign: event.continuationSign,
            eventMidCents: event.eventMidCents,
            responseMidCents: exitMid,
          });
        }
        if (
          isOneContractExecutable(eventQuote)
          && isOneContractExecutable(responseQuote)
          && eventQuote.yesBestBidCents != null
          && eventQuote.noBestBidCents != null
          && responseQuote.yesBestBidCents != null
          && responseQuote.noBestBidCents != null
        ) {
          try {
            signedExec = computeGrossExecutableOneContractPnlCents({
              continuationSign: event.continuationSign,
              entryYesBestBidCents: eventQuote.yesBestBidCents,
              entryNoBestBidCents: eventQuote.noBestBidCents,
              exitYesBestBidCents: responseQuote.yesBestBidCents,
              exitNoBestBidCents: responseQuote.noBestBidCents,
            });
            executableObservable = signedExec != null;
          } catch {
            signedExec = null;
            executableObservable = false;
          }
        }
      }
    }

    episodes.push({
      marketTicker: event.marketTicker,
      tradingDayUtc,
      candidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
      signedExecutablePnlCents: signedExec,
      signedMidpointContinuationCents: signedMid,
      responseObservable,
      executableObservable,
    });
    keys.push({
      marketTicker: event.marketTicker,
      tradingDayUtc,
      eventTimestampMs: event.eventTimestampMs,
      responseTimestampMs,
      responseObservable,
      executableObservable,
      signedExecutablePnlCents: signedExec,
      signedMidpointContinuationCents: signedMid,
    });
  }

  return { episodes, keys };
}
