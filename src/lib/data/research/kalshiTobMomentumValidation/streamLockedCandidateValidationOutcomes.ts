/**
 * Bounded-memory locked-candidate validation outcome streamer.
 *
 * Reconstructs frozen M14 episodes (W=5000|X=2|H=30000|continuation) from
 * forward-quote TOB JSONL and emits SyntheticValidationEpisode records with
 * signed gross executable P&L (primary) and midpoint diagnostic (secondary).
 *
 * Pure streaming engine. Production MUST call via
 * runGovernedRealCaptureMomentumValidation behind the outcome-open gate.
 * Do NOT point this at accepted M14 validation captures during development.
 */
import { join } from "node:path";

import type { ParsedTopOfBookRecord } from "../captureHealthAudit/captureHealthAuditTypes";
import { parseTopOfBookLine } from "../captureHealthAudit/parseCaptureHealthRecords";
import { resolveKalshiTimestampMs } from "../btcKalshiLeadLagAnalysis/leadLagUtils";
import type { MomentumDiscoveryIo } from "../kalshiTobMomentumDiscovery/momentumDiscoveryTypes";
import {
  RESPONSE_MATCH_TOLERANCE_MS,
  computeGrossExecutableOneContractPnlCents,
  diagnosticSignedMidpointContinuationCents,
  eventPassesFixedGates,
  isEligibleEventQuote,
  midpointFromQuote,
  refractoryPeriodMs,
  resolveBackwardReturnForEvent,
  resolveComplementExecutablePrices,
  utcTradingDayFromTimestampMs,
  type MomentumQuoteInput,
} from "../kalshiTobMomentumFamily";
import {
  LOCKED_MOMENTUM_VALIDATION_CANDIDATE,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  loadCloseTimeByMarketForBlindIncidence,
} from "../kalshiTobMomentumValidationCohort";

import {
  MomentumValidationError,
  type SyntheticValidationEpisode,
} from "./momentumValidationTypes";

const QUOTE_RING_RETENTION_MS = 12_000;

type ValidationPendingResponse = {
  marketTicker: string;
  tradingDayUtc: string;
  eventTimestampMs: number;
  targetMs: number;
  upperBoundMs: number;
  continuationSign: -1 | 1;
  entryYesBestBidCents: number;
  entryNoBestBidCents: number;
  entryMidCents: number;
  entryExecutable: boolean;
};

type MarketValidationState = {
  quoteRing: MomentumQuoteInput[];
  inThreshold: boolean;
  nextEligibleMs: number;
  pending: ValidationPendingResponse[];
  lastTimestampMs: number;
};

function recordToQuoteInput(
  record: ParsedTopOfBookRecord,
  timestampMs: number,
  quoteAgeMs: number | null,
): MomentumQuoteInput {
  return {
    marketTicker: record.marketTicker,
    timestampMs,
    yesBestBidCents: record.yesBestBidCents,
    noBestBidCents: record.noBestBidCents ?? null,
    yesBestBidSize: record.yesBestBidSize ?? null,
    noBestBidSize: record.noBestBidSize ?? null,
    bookState: record.bookState,
    isEconomicallyValid: record.isEconomicallyValid ?? null,
    quoteAgeMs,
  };
}

function isEligibleResponseQuote(quote: MomentumQuoteInput): boolean {
  const eligibility = isEligibleEventQuote(quote);
  if (!eligibility.eligible) {
    return false;
  }
  if (midpointFromQuote(quote) == null) {
    return false;
  }
  const executable = resolveComplementExecutablePrices({
    yesBestBidCents: quote.yesBestBidCents,
    noBestBidCents: quote.noBestBidCents,
  });
  return (
    executable.executableBuyYesCents != null
    && executable.executableSellYesCents != null
    && Number.isFinite(executable.executableBuyYesCents)
    && Number.isFinite(executable.executableSellYesCents)
  );
}

function isOneContractExecutable(quote: MomentumQuoteInput): boolean {
  return (
    quote.yesBestBidSize != null
    && quote.noBestBidSize != null
    && quote.yesBestBidSize >= 1
    && quote.noBestBidSize >= 1
  );
}

function pruneQuoteRing(quotes: MomentumQuoteInput[], nowMs: number): void {
  const cutoff = nowMs - QUOTE_RING_RETENTION_MS;
  let drop = 0;
  while (drop < quotes.length && quotes[drop]!.timestampMs < cutoff) {
    drop += 1;
  }
  if (drop > 0) {
    quotes.splice(0, drop);
  }
}

export type LockedCandidateValidationOutcomeStreamResult = {
  episodes: readonly SyntheticValidationEpisode[];
  diagnostics: {
    segmentRunId: string;
    tobRecordsScanned: number;
    firstCrossingEvents: number;
    refractoryEpisodes: number;
    candidateId: typeof LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
    responseObservableCount: number;
    executableObservableCount: number;
    /**
     * Count of per-market resolved Kalshi-ts regressions in file order.
     * Capture contract guarantees JSONL append/file order, NOT exchange-ts
     * monotonicity. Regressions are diagnostic only (fail-open) unless
     * `requireMonotonicTimestamps` is explicitly enabled.
     */
    eventTimeRegressions: number;
  };
};

/**
 * Stream one capture's top-of-book.jsonl for the locked candidate and emit
 * validation outcome episodes (including signed gross executable P&L).
 *
 * Causal stream order = JSONL file / append order (matches blind incidence and
 * TRAIN discovery). Resolved Kalshi event time (`exchangeTimestampMs ??
 * receivedAtMs`) labels events but is NOT a hard monotonicity contract —
 * small exchange-ts regressions are legal after OOO/duplicate emits.
 */
export async function streamLockedCandidateValidationOutcomes(input: {
  io: MomentumDiscoveryIo;
  segmentRunId: string;
  captureRunDir: string;
  candidateId?: typeof LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
  responseMatchToleranceMs?: number;
  closeTimeByMarket?: Map<string, number>;
  /**
   * Default false: align with capture writer + blind incidence (file order).
   * Set true only for adversarial tests of the legacy PR #93 hard-fail.
   */
  requireMonotonicTimestamps?: boolean;
  log?: (message: string) => void;
}): Promise<LockedCandidateValidationOutcomeStreamResult> {
  const candidateId = input.candidateId ?? LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
  if (candidateId !== LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID) {
    throw new MomentumValidationError(
      `validation outcome streamer only admits locked candidate `
        + `${LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID}`,
    );
  }

  const lookbackWindowMs = LOCKED_MOMENTUM_VALIDATION_CANDIDATE.lookbackWindowMs;
  const returnThresholdCents = LOCKED_MOMENTUM_VALIDATION_CANDIDATE.thresholdCents;
  const forwardHorizonMs = LOCKED_MOMENTUM_VALIDATION_CANDIDATE.responseHorizonMs;
  const toleranceMs = input.responseMatchToleranceMs ?? RESPONSE_MATCH_TOLERANCE_MS;
  const refractoryMs = refractoryPeriodMs(forwardHorizonMs);
  // File-order is authoritative; do not fail closed on exchange-ts regressions.
  const requireMonotonic = input.requireMonotonicTimestamps === true;
  const log = input.log ?? (() => {});

  const topOfBookPath = join(input.captureRunDir, "top-of-book.jsonl");
  if (!input.io.fileExists(topOfBookPath)) {
    throw new MomentumValidationError(`top-of-book missing: ${topOfBookPath}`);
  }

  const closeTimeByMarket =
    input.closeTimeByMarket
    ?? loadCloseTimeByMarketForBlindIncidence(input.io, input.captureRunDir);

  const marketState = new Map<string, MarketValidationState>();
  const episodes: SyntheticValidationEpisode[] = [];
  let tobRecordsScanned = 0;
  let firstCrossingEvents = 0;
  let refractoryEpisodes = 0;
  let responseObservableCount = 0;
  let executableObservableCount = 0;
  let eventTimeRegressions = 0;
  const started = Date.now();

  function getMarketState(ticker: string): MarketValidationState {
    let state = marketState.get(ticker);
    if (!state) {
      state = {
        quoteRing: [],
        inThreshold: false,
        nextEligibleMs: Number.NEGATIVE_INFINITY,
        pending: [],
        lastTimestampMs: Number.NEGATIVE_INFINITY,
      };
      marketState.set(ticker, state);
    }
    return state;
  }

  function finalizePending(
    pending: ValidationPendingResponse,
    matched: MomentumQuoteInput | null,
  ): void {
    if (matched == null) {
      episodes.push({
        marketTicker: pending.marketTicker,
        tradingDayUtc: pending.tradingDayUtc,
        candidateId,
        signedExecutablePnlCents: null,
        signedMidpointContinuationCents: null,
        responseObservable: false,
        executableObservable: false,
      });
      return;
    }

    responseObservableCount += 1;
    const exitMid = midpointFromQuote(matched);
    let signedMid: number | null = null;
    if (exitMid != null) {
      signedMid = diagnosticSignedMidpointContinuationCents({
        continuationSign: pending.continuationSign,
        eventMidCents: pending.entryMidCents,
        responseMidCents: exitMid,
      });
    }

    const sizesOk = isOneContractExecutable(matched);
    let signedExec: number | null = null;
    if (
      pending.entryExecutable
      && sizesOk
      && matched.yesBestBidCents != null
      && matched.noBestBidCents != null
    ) {
      try {
        signedExec = computeGrossExecutableOneContractPnlCents({
          continuationSign: pending.continuationSign,
          entryYesBestBidCents: pending.entryYesBestBidCents,
          entryNoBestBidCents: pending.entryNoBestBidCents,
          exitYesBestBidCents: matched.yesBestBidCents,
          exitNoBestBidCents: matched.noBestBidCents,
        });
        executableObservableCount += 1;
      } catch {
        signedExec = null;
      }
    }

    episodes.push({
      marketTicker: pending.marketTicker,
      tradingDayUtc: pending.tradingDayUtc,
      candidateId,
      signedExecutablePnlCents: signedExec,
      signedMidpointContinuationCents: signedMid,
      responseObservable: true,
      // Midpoint-only responses must NOT be labeled executable.
      executableObservable: signedExec != null,
    });
  }

  await input.io.iterateJsonl(topOfBookPath, {
    onLine: (line, meta) => {
      tobRecordsScanned += 1;
      if (tobRecordsScanned === 1 || tobRecordsScanned % 500_000 === 0) {
        log(
          `validation TOB stream [${input.segmentRunId}]: ${tobRecordsScanned} lines after `
            + `${((Date.now() - started) / 1000).toFixed(1)}s`,
        );
      }

      let record: ParsedTopOfBookRecord | null;
      try {
        record = parseTopOfBookLine(line, meta.lineNumber);
      } catch {
        return "continue";
      }
      if (!record) {
        return "continue";
      }

      const timestampMs = resolveKalshiTimestampMs({
        receivedAtMs: record.receivedAtMs,
        exchangeTimestampMs: record.exchangeTimestampMs,
      });
      const quoteAgeMs =
        record.exchangeTimestampMs != null
          ? Math.max(timestampMs - record.exchangeTimestampMs, 0)
          : Math.max(record.receivedAtMs - timestampMs, 0);

      const quote = recordToQuoteInput(record, timestampMs, quoteAgeMs ?? 0);
      const state = getMarketState(record.marketTicker);

      if (timestampMs < state.lastTimestampMs) {
        eventTimeRegressions += 1;
        if (requireMonotonic) {
          throw new MomentumValidationError(
            `non-monotonic TOB timestamp for ${record.marketTicker}: `
              + `${timestampMs} < ${state.lastTimestampMs}`,
          );
        }
        // Capture contract: file order is causal. Keep processing; event-time
        // labels may regress (OOO/duplicate WS emits still write TOB rows).
      }
      if (timestampMs >= state.lastTimestampMs) {
        state.lastTimestampMs = timestampMs;
      }

      if (state.pending.length > 0) {
        const stillPending: ValidationPendingResponse[] = [];
        for (const pending of state.pending) {
          if (timestampMs <= pending.eventTimestampMs) {
            stillPending.push(pending);
            continue;
          }
          if (timestampMs > pending.upperBoundMs) {
            finalizePending(pending, null);
            continue;
          }
          if (timestampMs >= pending.targetMs && timestampMs <= pending.upperBoundMs) {
            if (isEligibleResponseQuote(quote)) {
              finalizePending(pending, quote);
              continue;
            }
            stillPending.push(pending);
            continue;
          }
          stillPending.push(pending);
        }
        state.pending = stillPending;
      }

      pruneQuoteRing(state.quoteRing, timestampMs);
      if (
        state.quoteRing.length > 0
        && state.quoteRing[state.quoteRing.length - 1]!.timestampMs === timestampMs
      ) {
        state.quoteRing[state.quoteRing.length - 1] = quote;
      } else {
        state.quoteRing.push(quote);
      }

      const eligibility = isEligibleEventQuote(quote);
      if (!eligibility.eligible) {
        return "continue";
      }

      const closeTimeMs = closeTimeByMarket.get(record.marketTicker) ?? null;
      if (closeTimeMs != null && timestampMs >= closeTimeMs) {
        return "continue";
      }
      const timeRemainingMs =
        closeTimeMs == null ? null : Math.max(closeTimeMs - timestampMs, 0);
      if (timeRemainingMs == null) {
        return "continue";
      }

      const eventMid = midpointFromQuote(quote);
      if (eventMid == null) {
        return "continue";
      }

      const causalPriors = state.quoteRing.filter((q) => q.timestampMs < timestampMs);
      const anchor = resolveBackwardReturnForEvent({
        eventQuote: quote,
        backwardWindowMs: lookbackWindowMs,
        priorQuotes: causalPriors,
      });

      if (anchor.status === "fail-closed") {
        state.inThreshold = false;
        return "continue";
      }

      const absReturn = Math.abs(anchor.backwardReturnCents);
      const currentlyInThreshold = absReturn >= returnThresholdCents;
      const wasInThreshold = state.inThreshold;
      state.inThreshold = currentlyInThreshold;

      if (!currentlyInThreshold || wasInThreshold) {
        return "continue";
      }
      if (anchor.backwardReturnCents === 0) {
        return "continue";
      }

      firstCrossingEvents += 1;

      const gates = eventPassesFixedGates({
        quote,
        timeRemainingMs,
        forwardHorizonMs,
      });
      if (!gates.ok) {
        return "continue";
      }
      if (
        closeTimeMs != null
        && timestampMs + forwardHorizonMs >= closeTimeMs
      ) {
        return "continue";
      }

      if (timestampMs < state.nextEligibleMs) {
        return "continue";
      }

      if (quote.yesBestBidCents == null || quote.noBestBidCents == null) {
        return "continue";
      }

      refractoryEpisodes += 1;
      state.nextEligibleMs = timestampMs + refractoryMs;

      const continuationSign: -1 | 1 = anchor.backwardReturnCents > 0 ? 1 : -1;
      const targetMs = timestampMs + forwardHorizonMs;
      const upperBoundMs =
        closeTimeMs != null
          ? Math.min(targetMs + toleranceMs, closeTimeMs)
          : targetMs + toleranceMs;

      state.pending.push({
        marketTicker: record.marketTicker,
        tradingDayUtc: utcTradingDayFromTimestampMs(timestampMs),
        eventTimestampMs: timestampMs,
        targetMs,
        upperBoundMs,
        continuationSign,
        entryYesBestBidCents: quote.yesBestBidCents,
        entryNoBestBidCents: quote.noBestBidCents,
        entryMidCents: eventMid,
        entryExecutable: isOneContractExecutable(quote),
      });

      return "continue";
    },
  });

  for (const state of marketState.values()) {
    for (const pending of state.pending) {
      finalizePending(pending, null);
    }
    state.pending = [];
  }

  log(
    `validation TOB complete [${input.segmentRunId}]: scanned=${tobRecordsScanned} `
      + `crossings=${firstCrossingEvents} refractoryEpisodes=${refractoryEpisodes} `
      + `episodes=${episodes.length} eventTimeRegressions=${eventTimeRegressions}`,
  );

  if (episodes.length !== refractoryEpisodes) {
    throw new MomentumValidationError(
      "validation episode count must equal refractory-accepted crossings",
    );
  }

  return {
    episodes,
    diagnostics: {
      segmentRunId: input.segmentRunId,
      tobRecordsScanned,
      firstCrossingEvents,
      refractoryEpisodes,
      candidateId,
      responseObservableCount,
      executableObservableCount,
      eventTimeRegressions,
    },
  };
}
