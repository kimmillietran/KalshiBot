import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join } from "node:path";

import { parseIsoTimestampMs } from "../captureHealthAudit/captureHealthAuditUtils";
import { parseTopOfBookLine } from "../captureHealthAudit/parseCaptureHealthRecords";
import type { ParsedTopOfBookRecord } from "../captureHealthAudit/captureHealthAuditTypes";
import { resolveKalshiTimestampMs } from "../btcKalshiLeadLagAnalysis/leadLagUtils";
import type { MomentumDiscoveryIo } from "../kalshiTobMomentumDiscovery/momentumDiscoveryTypes";
import {
  RESPONSE_MATCH_TOLERANCE_MS,
  eventPassesFixedGates,
  isEligibleEventQuote,
  midpointFromQuote,
  refractoryPeriodMs,
  resolveBackwardReturnForEvent,
  resolveComplementExecutablePrices,
  type MomentumQuoteInput,
} from "../kalshiTobMomentumFamily";

import {
  accumulateStreamingBlindEpisodes,
  type StreamingBlindEpisodeFlags,
} from "./blindIncidenceCounter";
import {
  LOCKED_MOMENTUM_VALIDATION_CANDIDATE,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
} from "./lockedCandidateBinding";
import {
  MomentumValidationCohortError,
  type MomentumValidationBlindIncidence,
  type MomentumValidationIndependentUnitRecord,
} from "./momentumValidationCohortTypes";

/** Ring retention covers locked W=5s (+ margin). */
const QUOTE_RING_RETENTION_MS = 12_000;

type BlindPendingResponse = {
  marketTicker: string;
  eventTimestampMs: number;
  targetMs: number;
  upperBoundMs: number;
};

type MarketBlindState = {
  quoteRing: MomentumQuoteInput[];
  inThreshold: boolean;
  nextEligibleMs: number;
  pending: BlindPendingResponse[];
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

export function loadCloseTimeByMarketForBlindIncidence(
  io: MomentumDiscoveryIo,
  captureRunDir: string,
): Map<string, number> {
  const path = join(captureRunDir, "market-metadata.jsonl");
  const map = new Map<string, number>();
  if (!io.fileExists(path)) {
    return map;
  }
  const content = io.readFile(path);
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const ticker = typeof parsed.marketTicker === "string" ? parsed.marketTicker : null;
      const closeTime = typeof parsed.closeTime === "string" ? parsed.closeTime : null;
      if (!ticker || !closeTime) continue;
      const closeTimeMs = parseIsoTimestampMs(closeTime);
      if (closeTimeMs == null) continue;
      map.set(ticker, closeTimeMs);
    } catch {
      // skip malformed metadata lines
    }
  }
  return map;
}

/**
 * Content identity for cohort admission: sha256 of top-of-book.jsonl bytes.
 * Streams the file; never loads outcomes.
 */
export async function hashCaptureTopOfBookIdentity(topOfBookPath: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(topOfBookPath);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });
}

export type LockedCandidateBlindIncidenceResult = {
  incidence: MomentumValidationBlindIncidence;
  independentUnitIds: readonly string[];
  records: readonly MomentumValidationIndependentUnitRecord[];
  diagnostics: {
    tobRecordsScanned: number;
    firstCrossingEvents: number;
    refractoryEpisodes: number;
    candidateId: typeof LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
    outcomesOpened: false;
  };
};

/**
 * Stream a validation-segment TOB capture for the locked candidate only and emit
 * outcome-blind incidence / independent ESS.
 *
 * MUST NOT call computeGrossExecutableOneContractPnlCents,
 * diagnosticSignedMidpointContinuationCents, or any signed/P&L path.
 */
export async function streamLockedCandidateBlindIncidence(input: {
  io: MomentumDiscoveryIo;
  segmentRunId: string;
  captureRunDir: string;
  candidateId?: typeof LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
  responseMatchToleranceMs?: number;
  closeTimeByMarket?: Map<string, number>;
  log?: (message: string) => void;
}): Promise<LockedCandidateBlindIncidenceResult> {
  const candidateId = input.candidateId ?? LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
  if (candidateId !== LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID) {
    throw new MomentumValidationCohortError(
      `blind incidence streamer only admits locked candidate `
        + `${LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID}`,
    );
  }

  const lookbackWindowMs = LOCKED_MOMENTUM_VALIDATION_CANDIDATE.lookbackWindowMs;
  const returnThresholdCents = LOCKED_MOMENTUM_VALIDATION_CANDIDATE.thresholdCents;
  const forwardHorizonMs = LOCKED_MOMENTUM_VALIDATION_CANDIDATE.responseHorizonMs;
  const toleranceMs = input.responseMatchToleranceMs ?? RESPONSE_MATCH_TOLERANCE_MS;
  const refractoryMs = refractoryPeriodMs(forwardHorizonMs);
  const log = input.log ?? (() => {});

  const topOfBookPath = join(input.captureRunDir, "top-of-book.jsonl");
  if (!input.io.fileExists(topOfBookPath)) {
    throw new MomentumValidationCohortError(`top-of-book missing: ${topOfBookPath}`);
  }

  const closeTimeByMarket =
    input.closeTimeByMarket
    ?? loadCloseTimeByMarketForBlindIncidence(input.io, input.captureRunDir);

  const marketState = new Map<string, MarketBlindState>();
  const episodes: StreamingBlindEpisodeFlags[] = [];
  let tobRecordsScanned = 0;
  let firstCrossingEvents = 0;
  let refractoryEpisodes = 0;
  const started = Date.now();

  function getMarketState(ticker: string): MarketBlindState {
    let state = marketState.get(ticker);
    if (!state) {
      state = {
        quoteRing: [],
        inThreshold: false,
        nextEligibleMs: Number.NEGATIVE_INFINITY,
        pending: [],
      };
      marketState.set(ticker, state);
    }
    return state;
  }

  function finalizePending(pending: BlindPendingResponse, matched: MomentumQuoteInput | null): void {
    if (matched == null) {
      episodes.push({
        marketTicker: pending.marketTicker,
        eventTimestampMs: pending.eventTimestampMs,
        candidateId,
        qualifyingEpisode: true,
        responseObservable: false,
        executableObservable: false,
      });
      return;
    }
    const responseObservable = true;
    const executableObservable = isOneContractExecutable(matched);
    episodes.push({
      marketTicker: pending.marketTicker,
      eventTimestampMs: pending.eventTimestampMs,
      candidateId,
      qualifyingEpisode: true,
      responseObservable,
      executableObservable,
    });
  }

  await input.io.iterateJsonl(topOfBookPath, {
    onLine: (line, meta) => {
      tobRecordsScanned += 1;
      if (tobRecordsScanned === 1 || tobRecordsScanned % 500_000 === 0) {
        log(
          `blind TOB stream: ${tobRecordsScanned} lines after `
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

      // Match / expire pending responses (booleans only).
      if (state.pending.length > 0) {
        const stillPending: BlindPendingResponse[] = [];
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

      if (midpointFromQuote(quote) == null) {
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

      refractoryEpisodes += 1;
      state.nextEligibleMs = timestampMs + refractoryMs;

      const targetMs = timestampMs + forwardHorizonMs;
      const upperBoundMs =
        closeTimeMs != null
          ? Math.min(targetMs + toleranceMs, closeTimeMs)
          : targetMs + toleranceMs;

      state.pending.push({
        marketTicker: record.marketTicker,
        eventTimestampMs: timestampMs,
        targetMs,
        upperBoundMs,
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
    `blind TOB complete: scanned=${tobRecordsScanned} crossings=${firstCrossingEvents} `
      + `refractoryEpisodes=${refractoryEpisodes}`,
  );

  if (episodes.length !== refractoryEpisodes) {
    throw new MomentumValidationCohortError(
      "blind episode count must equal refractory-accepted crossings",
    );
  }

  const accumulated = accumulateStreamingBlindEpisodes({
    segmentRunId: input.segmentRunId,
    episodes,
  });

  return {
    incidence: accumulated.incidence,
    independentUnitIds: accumulated.independentUnitIds,
    records: accumulated.records,
    diagnostics: {
      tobRecordsScanned,
      firstCrossingEvents,
      refractoryEpisodes,
      candidateId,
      outcomesOpened: false,
    },
  };
}
