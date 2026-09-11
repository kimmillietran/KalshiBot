import { join } from "node:path";

import { parseIsoTimestampMs } from "../captureHealthAudit/captureHealthAuditUtils";
import { parseTopOfBookLine } from "../captureHealthAudit/parseCaptureHealthRecords";
import type { ParsedTopOfBookRecord } from "../captureHealthAudit/captureHealthAuditTypes";
import { resolveKalshiTimestampMs } from "../btcKalshiLeadLagAnalysis/leadLagUtils";
import {
  BACKWARD_WINDOWS_MS,
  FORWARD_HORIZONS_MS,
  RETURN_THRESHOLDS_CENTS,
  buildHypothesisId,
  computeGrossExecutableOneContractPnlCents,
  diagnosticSignedMidpointContinuationCents,
  enumerateMomentumHypotheses,
  eventPassesFixedGates,
  isEligibleEventQuote,
  midpointFromQuote,
  refractoryPeriodMs,
  resolveBackwardReturnForEvent,
  resolveComplementExecutablePrices,
  utcTradingDayFromTimestampMs,
  type MomentumQuoteInput,
} from "../kalshiTobMomentumFamily";
import { computeStructuralSimplicityRank } from "../momentumEvidenceContract";

import type { MomentumDiscoveryIo } from "./momentumDiscoveryTypes";

/** Ring buffer retention for W=15s anchors (+ tolerance). */
const QUOTE_RING_RETENTION_MS = 20_000;

export type CellAccumulator = {
  candidateId: string;
  hypothesisId: string;
  lookbackWindowMs: number;
  thresholdCents: number;
  responseHorizonMs: number;
  structuralSimplicityRank: number;
  rawEvents: number;
  refractoryEpisodes: number;
  observableResponses: number;
  executableObservableResponses: number;
  independentSignedExecutable: number[];
  independentSignedMidpoint: number[];
  independentMarketKeys: Set<string>;
  independentMarketDayKeys: Set<string>;
  allSignedExecutable: number[];
  allSignedMidpoint: number[];
  seenIndependentBlock: Set<string>;
};

type PendingResponse = {
  cellKey: string;
  marketTicker: string;
  tradingDayUtc: string;
  eventTimestampMs: number;
  targetMs: number;
  upperBoundMs: number;
  continuationSign: -1 | 1;
  entryYesBestBidCents: number;
  entryNoBestBidCents: number;
  entryMidCents: number;
};

type MarketStreamState = {
  quoteRing: MomentumQuoteInput[];
  inThresholdByWX: Map<string, boolean>;
  nextEligibleMsByCell: Map<string, number>;
  pending: PendingResponse[];
};

export type TrainStreamResult = {
  cells: Map<string, CellAccumulator>;
  tobRecordsScanned: number;
  validBookQuotes: number;
  economicallyValidQuotes: number;
  anchorResolvableQuotes: number;
  firstCrossingEventsTotal: number;
  refractoryEpisodesTotal: number;
  marketsTouched: Set<string>;
  marketDaysTouched: Set<string>;
  responseObservabilityByHorizonMs: Map<number, { observable: number; unobservable: number }>;
  maxPendingPeak: number;
  maxQuotesRetainedHint: number;
};

function wxKey(backwardWindowMs: number, returnThresholdCents: number): string {
  return `${backwardWindowMs}|${returnThresholdCents}`;
}

function createCellAccumulator(input: {
  lookbackWindowMs: number;
  thresholdCents: number;
  responseHorizonMs: number;
}): CellAccumulator {
  const hypothesisId = buildHypothesisId({
    backwardWindowMs: input.lookbackWindowMs,
    returnThresholdCents: input.thresholdCents,
    forwardHorizonMs: input.responseHorizonMs,
  });
  return {
    candidateId: hypothesisId,
    hypothesisId,
    lookbackWindowMs: input.lookbackWindowMs,
    thresholdCents: input.thresholdCents,
    responseHorizonMs: input.responseHorizonMs,
    structuralSimplicityRank: computeStructuralSimplicityRank({
      candidateId: hypothesisId,
      hypothesisId,
      lookbackWindowMs: input.lookbackWindowMs,
      thresholdCents: input.thresholdCents,
      responseHorizonMs: input.responseHorizonMs,
      direction: "continuation",
      discoveryRank: null,
    }),
    rawEvents: 0,
    refractoryEpisodes: 0,
    observableResponses: 0,
    executableObservableResponses: 0,
    independentSignedExecutable: [],
    independentSignedMidpoint: [],
    independentMarketKeys: new Set(),
    independentMarketDayKeys: new Set(),
    allSignedExecutable: [],
    allSignedMidpoint: [],
    seenIndependentBlock: new Set(),
  };
}

function ensureUniverseCells(cells: Map<string, CellAccumulator>): void {
  for (const hypothesis of enumerateMomentumHypotheses()) {
    const key = hypothesis.hypothesisId;
    if (!cells.has(key)) {
      cells.set(
        key,
        createCellAccumulator({
          lookbackWindowMs: hypothesis.backwardWindowMs,
          thresholdCents: hypothesis.returnThresholdCents,
          responseHorizonMs: hypothesis.forwardHorizonMs,
        }),
      );
    }
  }
}

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

function isOneContractExecutable(sizes: {
  yesBestBidSize: number;
  noBestBidSize: number;
}): boolean {
  return sizes.yesBestBidSize >= 1 && sizes.noBestBidSize >= 1;
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

export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

export function loadCloseTimeByMarket(
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
      // skip
    }
  }
  return map;
}

function finalizePendingAsUnobservable(
  pending: PendingResponse,
  cells: Map<string, CellAccumulator>,
  responseObservabilityByHorizonMs: Map<number, { observable: number; unobservable: number }>,
): void {
  const cell = cells.get(pending.cellKey);
  if (!cell) return;
  const horizonStats = responseObservabilityByHorizonMs.get(cell.responseHorizonMs) ?? {
    observable: 0,
    unobservable: 0,
  };
  horizonStats.unobservable += 1;
  responseObservabilityByHorizonMs.set(cell.responseHorizonMs, horizonStats);
}

function applyMatchedResponse(input: {
  pending: PendingResponse;
  quote: MomentumQuoteInput;
  cells: Map<string, CellAccumulator>;
  responseObservabilityByHorizonMs: Map<number, { observable: number; unobservable: number }>;
}): void {
  const cell = input.cells.get(input.pending.cellKey);
  if (!cell) return;

  const horizonStats = input.responseObservabilityByHorizonMs.get(cell.responseHorizonMs) ?? {
    observable: 0,
    unobservable: 0,
  };
  horizonStats.observable += 1;
  input.responseObservabilityByHorizonMs.set(cell.responseHorizonMs, horizonStats);
  cell.observableResponses += 1;

  const exitMid = midpointFromQuote(input.quote);
  const sizesOk =
    input.quote.yesBestBidSize != null
    && input.quote.noBestBidSize != null
    && isOneContractExecutable({
      yesBestBidSize: input.quote.yesBestBidSize,
      noBestBidSize: input.quote.noBestBidSize,
    });

  let signedExec: number | null = null;
  if (
    sizesOk
    && input.quote.yesBestBidCents != null
    && input.quote.noBestBidCents != null
  ) {
    try {
      signedExec = computeGrossExecutableOneContractPnlCents({
        continuationSign: input.pending.continuationSign,
        entryYesBestBidCents: input.pending.entryYesBestBidCents,
        entryNoBestBidCents: input.pending.entryNoBestBidCents,
        exitYesBestBidCents: input.quote.yesBestBidCents,
        exitNoBestBidCents: input.quote.noBestBidCents,
      });
      cell.executableObservableResponses += 1;
      cell.allSignedExecutable.push(signedExec);
    } catch {
      signedExec = null;
    }
  }

  let signedMid: number | null = null;
  if (exitMid != null) {
    signedMid = diagnosticSignedMidpointContinuationCents({
      continuationSign: input.pending.continuationSign,
      eventMidCents: input.pending.entryMidCents,
      responseMidCents: exitMid,
    });
    cell.allSignedMidpoint.push(signedMid);
  }

  const blockKey = `${input.pending.marketTicker}:${input.pending.tradingDayUtc}:${input.pending.cellKey}`;
  const countsIndependent = !cell.seenIndependentBlock.has(blockKey);
  if (countsIndependent && signedExec != null) {
    cell.seenIndependentBlock.add(blockKey);
    cell.independentSignedExecutable.push(signedExec);
    if (signedMid != null) {
      cell.independentSignedMidpoint.push(signedMid);
    }
    cell.independentMarketKeys.add(input.pending.marketTicker);
    cell.independentMarketDayKeys.add(`${input.pending.marketTicker}:${input.pending.tradingDayUtc}`);
  }
}

/**
 * Bounded-memory TRAIN TOB stream: per-market ring buffer + first-crossing + refractory + pending response match.
 */
export async function streamTrainMomentumDiscovery(input: {
  io: MomentumDiscoveryIo;
  trainCaptureRunDir: string;
  responseMatchToleranceMs: number;
  closeTimeByMarket?: Map<string, number>;
  log?: (message: string) => void;
}): Promise<TrainStreamResult> {
  const log = input.log ?? (() => {});
  const topOfBookPath = join(input.trainCaptureRunDir, "top-of-book.jsonl");
  if (!input.io.fileExists(topOfBookPath)) {
    throw new Error(`TRAIN top-of-book missing: ${topOfBookPath}`);
  }

  const closeTimeByMarket =
    input.closeTimeByMarket ?? loadCloseTimeByMarket(input.io, input.trainCaptureRunDir);

  const cells = new Map<string, CellAccumulator>();
  ensureUniverseCells(cells);

  const marketState = new Map<string, MarketStreamState>();
  const responseObservabilityByHorizonMs = new Map<number, { observable: number; unobservable: number }>();
  for (const horizon of FORWARD_HORIZONS_MS) {
    responseObservabilityByHorizonMs.set(horizon, { observable: 0, unobservable: 0 });
  }

  let tobRecordsScanned = 0;
  let validBookQuotes = 0;
  let economicallyValidQuotes = 0;
  let anchorResolvableQuotes = 0;
  let firstCrossingEventsTotal = 0;
  let refractoryEpisodesTotal = 0;
  let maxPendingPeak = 0;
  const marketsTouched = new Set<string>();
  const marketDaysTouched = new Set<string>();
  const started = Date.now();

  function getMarketState(ticker: string): MarketStreamState {
    let state = marketState.get(ticker);
    if (!state) {
      const inThresholdByWX = new Map<string, boolean>();
      for (const w of BACKWARD_WINDOWS_MS) {
        for (const x of RETURN_THRESHOLDS_CENTS) {
          inThresholdByWX.set(wxKey(w, x), false);
        }
      }
      state = {
        quoteRing: [],
        inThresholdByWX,
        nextEligibleMsByCell: new Map(),
        pending: [],
      };
      marketState.set(ticker, state);
    }
    return state;
  }

  await input.io.iterateJsonl(topOfBookPath, {
    onLine: (line, meta) => {
      tobRecordsScanned += 1;
      if (tobRecordsScanned === 1 || tobRecordsScanned % 500_000 === 0) {
        log(
          `TRAIN TOB stream: ${tobRecordsScanned} lines after ${((Date.now() - started) / 1000).toFixed(1)}s`,
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

      if (record.bookState === "valid") {
        validBookQuotes += 1;
      }
      if (record.isEconomicallyValid === true) {
        economicallyValidQuotes += 1;
      }

      const quote = recordToQuoteInput(record, timestampMs, quoteAgeMs ?? 0);
      const state = getMarketState(record.marketTicker);
      marketsTouched.add(record.marketTicker);

      // 1) Match / expire pending responses (strictly after event).
      if (state.pending.length > 0) {
        const stillPending: PendingResponse[] = [];
        for (const pending of state.pending) {
          if (timestampMs <= pending.eventTimestampMs) {
            stillPending.push(pending);
            continue;
          }
          if (timestampMs > pending.upperBoundMs) {
            finalizePendingAsUnobservable(pending, cells, responseObservabilityByHorizonMs);
            continue;
          }
          if (timestampMs >= pending.targetMs && timestampMs <= pending.upperBoundMs) {
            if (isEligibleResponseQuote(quote)) {
              applyMatchedResponse({
                pending,
                quote,
                cells,
                responseObservabilityByHorizonMs,
              });
              continue;
            }
            stillPending.push(pending);
            continue;
          }
          stillPending.push(pending);
        }
        state.pending = stillPending;
      }

      // Update ring buffer (bounded retention for backward anchors).
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
      if (
        eventMid == null
        || quote.yesBestBidCents == null
        || quote.noBestBidCents == null
      ) {
        return "continue";
      }

      const tradingDayUtc = utcTradingDayFromTimestampMs(timestampMs);
      marketDaysTouched.add(`${record.marketTicker}:${tradingDayUtc}`);

      // Causal priors strictly before event time (computed once per quote).
      const causalPriors = state.quoteRing.filter((q) => q.timestampMs < timestampMs);

      for (const backwardWindowMs of BACKWARD_WINDOWS_MS) {
        for (const returnThresholdCents of RETURN_THRESHOLDS_CENTS) {
          const key = wxKey(backwardWindowMs, returnThresholdCents);
          const anchor = resolveBackwardReturnForEvent({
            eventQuote: quote,
            backwardWindowMs,
            priorQuotes: causalPriors,
          });

          if (anchor.status === "fail-closed") {
            state.inThresholdByWX.set(key, false);
            continue;
          }

          anchorResolvableQuotes += 1;
          const absReturn = Math.abs(anchor.backwardReturnCents);
          const currentlyInThreshold = absReturn >= returnThresholdCents;
          const wasInThreshold = state.inThresholdByWX.get(key) ?? false;
          state.inThresholdByWX.set(key, currentlyInThreshold);

          if (!currentlyInThreshold || wasInThreshold) {
            continue;
          }

          if (anchor.backwardReturnCents === 0) {
            continue;
          }

          firstCrossingEventsTotal += 1;
          const continuationSign: -1 | 1 = anchor.backwardReturnCents > 0 ? 1 : -1;

          for (const forwardHorizonMs of FORWARD_HORIZONS_MS) {
            const gates = eventPassesFixedGates({
              quote,
              timeRemainingMs,
              forwardHorizonMs,
            });
            if (!gates.ok) {
              continue;
            }

            const cellKey = buildHypothesisId({
              backwardWindowMs,
              returnThresholdCents,
              forwardHorizonMs,
            });
            const cell = cells.get(cellKey)!;
            cell.rawEvents += 1;

            const refractoryMs = refractoryPeriodMs(forwardHorizonMs);
            const nextEligible = state.nextEligibleMsByCell.get(cellKey) ?? Number.NEGATIVE_INFINITY;
            if (timestampMs < nextEligible) {
              continue;
            }

            cell.refractoryEpisodes += 1;
            refractoryEpisodesTotal += 1;
            state.nextEligibleMsByCell.set(cellKey, timestampMs + refractoryMs);

            const targetMs = timestampMs + forwardHorizonMs;
            const upperBoundMs =
              closeTimeMs != null
                ? Math.min(targetMs + input.responseMatchToleranceMs, closeTimeMs)
                : targetMs + input.responseMatchToleranceMs;

            state.pending.push({
              cellKey,
              marketTicker: record.marketTicker,
              tradingDayUtc,
              eventTimestampMs: timestampMs,
              targetMs,
              upperBoundMs,
              continuationSign,
              entryYesBestBidCents: quote.yesBestBidCents!,
              entryNoBestBidCents: quote.noBestBidCents!,
              entryMidCents: eventMid,
            });
          }
        }
      }

      if (state.pending.length > maxPendingPeak) {
        maxPendingPeak = state.pending.length;
      }

      return "continue";
    },
  });

  for (const state of marketState.values()) {
    for (const pending of state.pending) {
      finalizePendingAsUnobservable(pending, cells, responseObservabilityByHorizonMs);
    }
    state.pending = [];
  }

  log(
    `TRAIN TOB complete: scanned=${tobRecordsScanned} crossings=${firstCrossingEventsTotal} `
      + `refractoryEpisodes=${refractoryEpisodesTotal} pendingPeak=${maxPendingPeak}`,
  );

  return {
    cells,
    tobRecordsScanned,
    validBookQuotes,
    economicallyValidQuotes,
    anchorResolvableQuotes,
    firstCrossingEventsTotal,
    refractoryEpisodesTotal,
    marketsTouched,
    marketDaysTouched,
    responseObservabilityByHorizonMs,
    maxPendingPeak,
    maxQuotesRetainedHint: maxPendingPeak,
  };
}

export function summarizeCellMetrics(cell: CellAccumulator): {
  signedExecutableMeanCents: number | null;
  signedExecutableMedianCents: number | null;
  signedMidpointMeanCents: number | null;
  signedMidpointMedianCents: number | null;
  directionalResponseShare: number | null;
  executableObservabilityShare: number | null;
  effectiveSampleSize: number;
  independentMarkets: number;
  independentMarketDays: number;
} {
  const independent = cell.independentSignedExecutable;
  const directionalShare =
    independent.length === 0
      ? null
      : independent.filter((value) => value > 0).length / independent.length;

  return {
    signedExecutableMeanCents: mean(independent),
    signedExecutableMedianCents: median(independent),
    signedMidpointMeanCents: mean(cell.independentSignedMidpoint),
    signedMidpointMedianCents: median(cell.independentSignedMidpoint),
    directionalResponseShare: directionalShare,
    executableObservabilityShare:
      cell.refractoryEpisodes === 0
        ? null
        : cell.executableObservableResponses / cell.refractoryEpisodes,
    effectiveSampleSize: independent.length,
    independentMarkets: cell.independentMarketKeys.size,
    independentMarketDays: cell.independentMarketDayKeys.size,
  };
}
