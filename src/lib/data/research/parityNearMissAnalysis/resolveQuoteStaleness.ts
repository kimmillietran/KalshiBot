export type QuoteAgeStatus = "known" | "unknown" | "negative";

export type QuoteStalenessEvaluation = {
  quoteAgeMs: number | null;
  quoteAgeStatus: QuoteAgeStatus;
  stalenessPass: boolean | null;
  stalenessReject: boolean;
};

/** Normalizes epoch values that may have been persisted in seconds. */
export function normalizeExchangeTimestampMs(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  return value < 1_000_000_000_000 ? value * 1000 : value;
}

export function resolveQuoteAgeMs(
  receivedAtMs: number,
  exchangeTimestampMs: number | null | undefined,
): { quoteAgeMs: number | null; quoteAgeStatus: QuoteAgeStatus } {
  if (exchangeTimestampMs === null || exchangeTimestampMs === undefined) {
    return { quoteAgeMs: null, quoteAgeStatus: "unknown" };
  }

  const normalizedExchangeMs = normalizeExchangeTimestampMs(exchangeTimestampMs);
  const quoteAgeMs = receivedAtMs - normalizedExchangeMs;
  if (quoteAgeMs < 0) {
    return { quoteAgeMs, quoteAgeStatus: "negative" };
  }

  return { quoteAgeMs, quoteAgeStatus: "known" };
}

/**
 * Offline capture staleness uses exchange-to-local receive lag at capture time.
 * Unknown age is not treated as pass; negative age is treated as fresh (0ms effective lag).
 */
export function evaluateQuoteStaleness(input: {
  receivedAtMs: number;
  exchangeTimestampMs: number | null | undefined;
  stalenessBoundMs: number;
}): QuoteStalenessEvaluation {
  const { quoteAgeMs, quoteAgeStatus } = resolveQuoteAgeMs(
    input.receivedAtMs,
    input.exchangeTimestampMs,
  );

  if (quoteAgeStatus === "unknown") {
    return {
      quoteAgeMs,
      quoteAgeStatus,
      stalenessPass: null,
      stalenessReject: false,
    };
  }

  if (quoteAgeStatus === "negative") {
    return {
      quoteAgeMs: 0,
      quoteAgeStatus,
      stalenessPass: true,
      stalenessReject: false,
    };
  }

  const stalenessPass = quoteAgeMs! <= input.stalenessBoundMs;
  return {
    quoteAgeMs,
    quoteAgeStatus,
    stalenessPass,
    stalenessReject: !stalenessPass,
  };
}
