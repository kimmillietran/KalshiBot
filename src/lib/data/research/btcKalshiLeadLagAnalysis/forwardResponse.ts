import type {
  BtcDirection,
  ForwardResponseObservation,
  LagResponseState,
  QuoteSnapshot,
  ResponseWindowMs,
} from "./btcKalshiLeadLagAnalysisTypes";
import {
  expectedKalshiDirectionForBtcMove,
  isDirectionallyCorrect,
  signedYesMidResponseCents,
} from "./resolveMarketContractSemantics";
import { findFirstQuoteAtOrAfter } from "./quoteMeasures";
import { resolveKalshiDirection } from "./leadLagUtils";

function changeOrNull(
  after: number | null | undefined,
  before: number | null | undefined,
): number | null {
  if (after === null || after === undefined || before === null || before === undefined) {
    return null;
  }
  return after - before;
}

function classifyLagResponseState(input: {
  responseQuote: QuoteSnapshot | null;
  signedYesMidResponseCents: number | null;
  directionallyCorrect: boolean | null;
  triggerQuote: QuoteSnapshot;
}): LagResponseState {
  if (!input.responseQuote) {
    return "response-unavailable";
  }
  if (!input.responseQuote.bookValid) {
    return "book-invalid";
  }
  if (!input.responseQuote.bookSynchronized) {
    return "book-unsynchronized";
  }
  if (
    input.triggerQuote.quoteAgeMs !== null
    && input.responseQuote.quoteAgeMs !== null
    && input.responseQuote.quoteAgeMs > 5_000
  ) {
    return "quote-stale";
  }
  if (input.signedYesMidResponseCents === null) {
    return "no-observable-kalshi-response";
  }
  if (Math.abs(input.signedYesMidResponseCents) < 1) {
    return "sub-1-cent-response";
  }
  if (input.directionallyCorrect === false) {
    return "directionally-wrong-response";
  }
  if (input.directionallyCorrect === true) {
    return "directionally-correct-response";
  }
  return "1-cent-or-greater-response";
}

export function computeForwardResponses(input: {
  triggerTimestampMs: number;
  triggerQuote: QuoteSnapshot;
  quotes: readonly QuoteSnapshot[];
  closeTimeMs: number | null;
  btcDirection: BtcDirection;
  comparisonDirection: "above-threshold" | null;
  responseWindowsMs: readonly ResponseWindowMs[];
  responseMatchToleranceMs: number;
  stalenessBoundMs: number;
}): ForwardResponseObservation[] {
  const expectedDirection = expectedKalshiDirectionForBtcMove(
    input.btcDirection,
    input.comparisonDirection,
  );

  return input.responseWindowsMs.map((responseWindowMs) => {
    const targetResponseTimeMs = input.triggerTimestampMs + responseWindowMs;
    const responseQuote = findFirstQuoteAtOrAfter(
      input.quotes,
      targetResponseTimeMs,
      input.responseMatchToleranceMs,
      input.closeTimeMs,
    );
    const marketStillOpen = input.closeTimeMs === null || targetResponseTimeMs < input.closeTimeMs;
    const yesMidChangeCents = changeOrNull(responseQuote?.yesMidCents, input.triggerQuote.yesMidCents);
    const signedMid = signedYesMidResponseCents(yesMidChangeCents, expectedDirection);
    const actualDirection = resolveKalshiDirection(yesMidChangeCents);
    const directionallyCorrect = isDirectionallyCorrect(actualDirection, expectedDirection);

    const observation: ForwardResponseObservation = {
      responseWindowMs,
      targetResponseTimeMs,
      actualMatchedResponseTimeMs: responseQuote?.timestampMs ?? null,
      responseMatchErrorMs:
        responseQuote === null ? null : responseQuote.timestampMs - targetResponseTimeMs,
      yesBidChangeCents: changeOrNull(responseQuote?.yesBidCents, input.triggerQuote.yesBidCents),
      yesAskChangeCents: changeOrNull(responseQuote?.yesAskCents, input.triggerQuote.yesAskCents),
      yesMidChangeCents,
      noBidChangeCents: changeOrNull(responseQuote?.noBidCents, input.triggerQuote.noBidCents),
      noAskChangeCents: changeOrNull(responseQuote?.noAskCents, input.triggerQuote.noAskCents),
      spreadChangeCents: changeOrNull(responseQuote?.spreadCents, input.triggerQuote.spreadCents),
      sizeChange: changeOrNull(responseQuote?.bestDisplayedSize, input.triggerQuote.bestDisplayedSize),
      bookValid: responseQuote?.bookValid ?? null,
      bookSynchronized: responseQuote?.bookSynchronized ?? null,
      quoteAgeMs: responseQuote?.quoteAgeMs ?? null,
      marketStillOpen,
      timeRemainingMs:
        input.closeTimeMs === null ? null : Math.max(input.closeTimeMs - targetResponseTimeMs, 0),
      expectedKalshiDirection: expectedDirection,
      actualKalshiDirection: actualDirection,
      directionallyCorrect,
      signedYesBidResponseCents: signedYesMidResponseCents(
        changeOrNull(responseQuote?.yesBidCents, input.triggerQuote.yesBidCents),
        expectedDirection,
      ),
      signedYesAskResponseCents: signedYesMidResponseCents(
        changeOrNull(responseQuote?.yesAskCents, input.triggerQuote.yesAskCents),
        expectedDirection,
      ),
      signedYesMidResponseCents: signedMid,
      absoluteResponseCents: yesMidChangeCents === null ? null : Math.abs(yesMidChangeCents),
      responseLatencyMs:
        responseQuote === null ? null : responseQuote.timestampMs - input.triggerTimestampMs,
      noResponseWithinWindow: responseQuote === null,
      responseReversal:
        signedMid !== null && Math.sign(signedMid) < 0 && Math.abs(signedMid) >= 1,
      maximumAdverseResponseCents:
        signedMid !== null && signedMid < 0 ? Math.abs(signedMid) : 0,
      maximumFavorableResponseCents:
        signedMid !== null && signedMid > 0 ? signedMid : 0,
      lagResponseState: classifyLagResponseState({
        responseQuote,
        signedYesMidResponseCents: signedMid,
        directionallyCorrect,
        triggerQuote: input.triggerQuote,
      }),
    };

    return observation;
  });
}

export function firstResponseLatencyForMagnitude(
  responses: readonly ForwardResponseObservation[],
  minimumAbsCents: number,
): number | null {
  for (const response of responses) {
    if (
      response.responseLatencyMs !== null
      && response.signedYesMidResponseCents !== null
      && Math.abs(response.signedYesMidResponseCents) >= minimumAbsCents
    ) {
      return response.responseLatencyMs;
    }
  }
  return null;
}
