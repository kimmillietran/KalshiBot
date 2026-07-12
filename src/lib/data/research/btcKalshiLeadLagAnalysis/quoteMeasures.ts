import { midProbabilityFromCents } from "@/lib/features/contractPricing";

import type { QuoteSnapshot } from "./btcKalshiLeadLagAnalysisTypes";
import { parseIsoTimestampMs, readNumber, readString, resolveKalshiTimestampMs } from "./leadLagUtils";

export function buildQuoteSnapshot(
  parsed: Record<string, unknown>,
  receivedAtMs: number,
  stalenessBoundMs: number,
): QuoteSnapshot {
  const yesBidCents = readNumber(parsed.yesBestBidCents);
  const yesAskCents = readNumber(parsed.yesBestAskCents);
  const noBidCents = readNumber(parsed.noBestBidCents);
  const noAskCents = readNumber(parsed.noBestAskCents);
  const yesBidSize = readNumber(parsed.yesBestBidSize);
  const noBidSize = readNumber(parsed.noBestBidSize);
  const exchangeTimestampMs = readNumber(parsed.exchangeTimestampMs);
  const sequence = readNumber(parsed.sequence);
  const bookState = readString(parsed.bookState) ?? "valid";
  const bookValid = bookState === "valid";
  const priorSequence = readNumber(parsed.priorSequence);
  const bookSynchronized =
    sequence === null || priorSequence === null ? true : sequence > priorSequence;

  const yesMidCents =
    yesBidCents !== null && yesAskCents !== null
      ? (yesBidCents + yesAskCents) / 2
      : yesBidCents ?? yesAskCents;
  const noMidCents =
    noBidCents !== null && noAskCents !== null
      ? (noBidCents + noAskCents) / 2
      : noBidCents ?? noAskCents;
  const spreadCents =
    yesBidCents !== null && yesAskCents !== null
      ? Math.max(yesAskCents - yesBidCents, 0)
      : null;

  const kalshiTimestampMs = resolveKalshiTimestampMs({ receivedAtMs, exchangeTimestampMs });
  const quoteAgeMs =
    exchangeTimestampMs !== null ? Math.max(kalshiTimestampMs - exchangeTimestampMs, 0) : null;

  return {
    timestampMs: kalshiTimestampMs,
    receivedAtLocal: readString(parsed.receivedAtLocal) ?? new Date(receivedAtMs).toISOString(),
    yesBidCents,
    yesAskCents,
    noBidCents,
    noAskCents,
    yesMidCents,
    noMidCents,
    spreadCents,
    executableBuyYesCents: yesAskCents,
    executableSellYesCents: yesBidCents,
    bestDisplayedSize:
      yesBidSize !== null && noBidSize !== null
        ? Math.min(yesBidSize, noBidSize)
        : yesBidSize ?? noBidSize,
    bookValid,
    bookSynchronized,
    quoteAgeMs:
      quoteAgeMs !== null && quoteAgeMs > stalenessBoundMs ? quoteAgeMs : quoteAgeMs,
    sequence,
  };
}

export function parseTopOfBookLine(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseTopOfBookTimestampMs(parsed: Record<string, unknown>): number | null {
  const receivedAtLocal = readString(parsed.receivedAtLocal);
  const receivedAtMs = receivedAtLocal ? parseIsoTimestampMs(receivedAtLocal) : null;
  if (receivedAtMs === null) {
    return null;
  }
  return resolveKalshiTimestampMs({
    receivedAtMs,
    exchangeTimestampMs: readNumber(parsed.exchangeTimestampMs),
  });
}

export function impliedProbabilityFromQuote(quote: QuoteSnapshot): number | null {
  if (quote.yesBidCents === null || quote.yesAskCents === null) {
    return quote.yesMidCents !== null ? quote.yesMidCents / 100 : null;
  }
  return midProbabilityFromCents(quote.yesBidCents, quote.yesAskCents);
}

export function findLastQuoteAtOrBefore(
  quotes: readonly QuoteSnapshot[],
  timestampMs: number,
): QuoteSnapshot | null {
  let result: QuoteSnapshot | null = null;
  for (const quote of quotes) {
    if (quote.timestampMs <= timestampMs) {
      result = quote;
    } else {
      break;
    }
  }
  return result;
}

export function findFirstQuoteAtOrAfter(
  quotes: readonly QuoteSnapshot[],
  timestampMs: number,
  toleranceMs: number,
  closeTimeMs: number | null,
): QuoteSnapshot | null {
  const upperBound =
    closeTimeMs !== null ? Math.min(timestampMs + toleranceMs, closeTimeMs) : timestampMs + toleranceMs;

  for (const quote of quotes) {
    if (quote.timestampMs < timestampMs) {
      continue;
    }
    if (quote.timestampMs > upperBound) {
      break;
    }
    return quote;
  }
  return null;
}
