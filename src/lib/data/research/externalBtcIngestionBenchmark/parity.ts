/**
 * Semantic parity checks between baseline and optimized quote streams.
 */

import type { BboPoint } from "@/lib/data/research/externalBtcDelayedRepricingPilot/bookReplay";

import type { ParityResult } from "./types";

export function compareQuoteStreams(
  baseline: readonly BboPoint[],
  candidate: readonly BboPoint[],
  finalBookHashBaseline: string,
  finalBookHashCandidate: string,
): ParityResult {
  const quoteHashMatch =
    baseline.length === candidate.length
    && baseline.every((q, i) => {
      const c = candidate[i]!;
      return (
        q.timestampMs === c.timestampMs
        && q.bid === c.bid
        && q.ask === c.ask
        && q.bidSize === c.bidSize
        && q.askSize === c.askSize
        && q.chainBreak === c.chainBreak
        && q.failClosed === c.failClosed
        && q.adapterTimestampMs === c.adapterTimestampMs
        && q.exchangeTimestampMs === c.exchangeTimestampMs
      );
    });

  let firstMismatch: string | null = null;
  if (!quoteHashMatch) {
    const n = Math.max(baseline.length, candidate.length);
    for (let i = 0; i < n; i += 1) {
      const b = baseline[i];
      const c = candidate[i];
      if (!b || !c) {
        firstMismatch = `length-mismatch at ${i}: baseline=${baseline.length} candidate=${candidate.length}`;
        break;
      }
      if (
        b.timestampMs !== c.timestampMs
        || b.bid !== c.bid
        || b.ask !== c.ask
        || b.bidSize !== c.bidSize
        || b.askSize !== c.askSize
        || b.chainBreak !== c.chainBreak
        || b.failClosed !== c.failClosed
      ) {
        firstMismatch =
          `quote[${i}] baseline=(${b.timestampMs},${b.bid},${b.ask},${b.bidSize},${b.askSize},cb=${b.chainBreak},fc=${b.failClosed}) `
          + `candidate=(${c.timestampMs},${c.bid},${c.ask},${c.bidSize},${c.askSize},cb=${c.chainBreak},fc=${c.failClosed})`;
        break;
      }
    }
  }

  const finalBookHashMatch = finalBookHashBaseline === finalBookHashCandidate;
  if (!finalBookHashMatch && firstMismatch == null) {
    firstMismatch = `final-book-hash mismatch ${finalBookHashBaseline.slice(0, 12)} vs ${finalBookHashCandidate.slice(0, 12)}`;
  }

  return {
    matched: quoteHashMatch && finalBookHashMatch,
    quoteHashMatch,
    finalBookHashMatch,
    baselineQuotes: baseline.length,
    candidateQuotes: candidate.length,
    firstMismatch,
  };
}
