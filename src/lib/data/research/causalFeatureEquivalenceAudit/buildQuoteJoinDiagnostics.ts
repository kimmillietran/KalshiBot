import { averageFinite, percentile } from "@/lib/utils/stats";

import type { BtcSpotPoint } from "../btcKalshiLeadLagAnalysis/causalBtcJoin";
import { safeShare } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";

import type { QuoteJoinDiagnostics } from "./causalFeatureEquivalenceAuditTypes";

export type QuoteTimestamp = {
  timestampMs: number;
};

export type QuoteJoinDiagnosticsOptions = {
  /** Optional operation counter for performance tests (binary-search / cursor advances). */
  opCounter?: { comparisons: number };
};

/**
 * Causal quote→BTC join age via a single forward linear cursor over sorted sources.
 * Quotes should be processed in non-decreasing timestamp order for O(N+M).
 * Separate from adjacent source cadence diagnostics.
 */
export function buildQuoteJoinDiagnostics(
  quotes: readonly QuoteTimestamp[],
  btcPoints: readonly BtcSpotPoint[],
  options?: QuoteJoinDiagnosticsOptions,
): QuoteJoinDiagnostics {
  const opCounter = options?.opCounter;
  const ages: number[] = [];
  let observationsWithCausalSource = 0;
  let observationsWithNoCausalSource = 0;
  let negativeAgeCount = 0;
  let futureSourceLeakageCount = 0;
  let ageAtOrBelow5000Count = 0;
  let ageAbove5000Count = 0;

  let cursor = 0;
  for (const quote of quotes) {
    while (
      cursor + 1 < btcPoints.length
      && btcPoints[cursor + 1]!.timestampMs <= quote.timestampMs
    ) {
      cursor += 1;
      if (opCounter) {
        opCounter.comparisons += 1;
      }
    }
    if (opCounter) {
      opCounter.comparisons += 1;
    }

    const candidate =
      cursor < btcPoints.length && btcPoints[cursor]!.timestampMs <= quote.timestampMs
        ? btcPoints[cursor]!
        : null;

    if (!candidate) {
      observationsWithNoCausalSource += 1;
      // Check whether any future-only source exists after the quote.
      const firstFuture = btcPoints.find((point) => {
        if (opCounter) {
          opCounter.comparisons += 1;
        }
        return point.timestampMs > quote.timestampMs;
      });
      if (firstFuture) {
        futureSourceLeakageCount += 1;
      }
      continue;
    }

    observationsWithCausalSource += 1;
    const ageMs = quote.timestampMs - candidate.timestampMs;
    if (ageMs < 0) {
      negativeAgeCount += 1;
    }
    ages.push(ageMs);
    if (ageMs <= 5000) {
      ageAtOrBelow5000Count += 1;
    } else {
      ageAbove5000Count += 1;
    }
  }

  // Detect future leakage relative to any quote when a later source is used — already
  // prevented by causal cursor; count quotes that have only future sources above.

  const sortedAges = [...ages].sort((left, right) => left - right);

  return {
    observationsScanned: quotes.length,
    observationsWithCausalSource,
    observationsWithNoCausalSource,
    ageMinMs: sortedAges[0] ?? null,
    ageMaxMs: sortedAges[sortedAges.length - 1] ?? null,
    ageMeanMs: averageFinite(ages),
    ageP50Ms: sortedAges.length ? percentile(sortedAges, 50) : null,
    ageP90Ms: sortedAges.length ? percentile(sortedAges, 90) : null,
    ageP95Ms: sortedAges.length ? percentile(sortedAges, 95) : null,
    ageP99Ms: sortedAges.length ? percentile(sortedAges, 99) : null,
    ageAtOrBelow5000Count,
    ageAtOrBelow5000Share: safeShare(ageAtOrBelow5000Count, ages.length),
    ageAbove5000Count,
    ageAbove5000Share: safeShare(ageAbove5000Count, ages.length),
    negativeAgeCount,
    futureSourceLeakageCount,
    sourceTimestampField: "exchangeTimestampMs??receivedAtMs",
    quoteTimestampField: "exchangeTimestampMs??receivedAtLocal",
    clockDomainCaveat:
      "BTC and quote clocks may differ; join age is computed from recorded timestamps without clock repair.",
  };
}
