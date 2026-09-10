import { join } from "node:path";

import { parseIsoTimestampMs } from "../captureHealthAudit/captureHealthAuditUtils";
import { parseTopOfBookLine } from "../captureHealthAudit/parseCaptureHealthRecords";
import type { ParsedTopOfBookRecord } from "../captureHealthAudit/captureHealthAuditTypes";
import {
  classifyTimeRemainingBin,
  computeGrossExecutableOneContractPnlCents,
  computeTobSizeImbalance,
  deriveYesBestAskCents,
  IMBALANCE_THRESHOLD_ABS,
  isEligibleEventQuote,
  MAX_EVENT_QUOTE_AGE_MS,
  midpointYesCents,
  predictedYesRepricingSign,
  refractoryPeriodMs,
  RESPONSE_HORIZONS_MS,
  resolveComplementExecutablePrices,
  utcTradingDayFromTimestampMs,
  type TobImbalanceQuoteInput,
} from "../spreadLiquidityMicrostructureFamily";
import { resolveKalshiTimestampMs } from "../btcKalshiLeadLagAnalysis/leadLagUtils";

import { computeStructuralSimplicityRank } from "./preOpenGate";
import type { MicrostructureDiscoveryIo } from "./microstructureDiscoveryTypes";

export type CellAccumulator = {
  candidateId: string;
  hypothesisId: string;
  imbalanceThresholdAbs: number;
  responseHorizonMs: number;
  timeRemainingBin: string;
  structuralSimplicityRank: number;
  rawEvents: number;
  refractoryEpisodes: number;
  observableResponses: number;
  executableObservableResponses: number;
  /** Independent usable signed executable samples (≤1 per market/day). */
  independentSignedExecutable: number[];
  independentSignedMidpoint: number[];
  independentMarketKeys: Set<string>;
  independentMarketDayKeys: Set<string>;
  /** Diagnostic: all refractory episodes' signed exec when observable (may include same-day extras). */
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
  predictedSign: -1 | 1;
  entryBuyYesCents: number;
  entrySellYesCents: number;
  entryMidCents: number | null;
  entrySpreadCents: number | null;
  entryYesBidSize: number;
  entryNoBidSize: number;
};

type MarketStreamState = {
  inThresholdByAbs: Map<number, boolean>;
  nextEligibleMsByCell: Map<string, number>;
  pending: PendingResponse[];
};

export type TrainStreamResult = {
  cells: Map<string, CellAccumulator>;
  tobRecordsScanned: number;
  validBookQuotes: number;
  economicallyValidQuotes: number;
  bidSizeAvailableQuotes: number;
  firstCrossingEventsTotal: number;
  refractoryEpisodesTotal: number;
  marketsTouched: Set<string>;
  marketDaysTouched: Set<string>;
  responseObservabilityByHorizonMs: Map<number, { observable: number; unobservable: number }>;
  maxPendingPeak: number;
  maxQuotesRetainedHint: number;
};

function buildCellKey(input: {
  imbalanceThresholdAbs: number;
  responseHorizonMs: number;
  timeRemainingBin: string;
}): string {
  return [
    `imb-${input.imbalanceThresholdAbs.toFixed(2)}`,
    `h-${input.responseHorizonMs}`,
    input.timeRemainingBin,
    "same-direction",
  ].join("|");
}

function createCellAccumulator(input: {
  imbalanceThresholdAbs: number;
  responseHorizonMs: number;
  timeRemainingBin: string;
}): CellAccumulator {
  const candidateId = buildCellKey(input);
  return {
    candidateId,
    hypothesisId: candidateId,
    imbalanceThresholdAbs: input.imbalanceThresholdAbs,
    responseHorizonMs: input.responseHorizonMs,
    timeRemainingBin: input.timeRemainingBin,
    structuralSimplicityRank: computeStructuralSimplicityRank(input),
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
  for (const threshold of IMBALANCE_THRESHOLD_ABS) {
    for (const horizon of RESPONSE_HORIZONS_MS) {
      for (const timeRemainingBin of ["under-5-minutes", "5-to-15-minutes"] as const) {
        const key = buildCellKey({
          imbalanceThresholdAbs: threshold,
          responseHorizonMs: horizon,
          timeRemainingBin,
        });
        if (!cells.has(key)) {
          cells.set(
            key,
            createCellAccumulator({
              imbalanceThresholdAbs: threshold,
              responseHorizonMs: horizon,
              timeRemainingBin,
            }),
          );
        }
      }
    }
  }
}

function recordToQuoteInput(
  record: ParsedTopOfBookRecord,
  timestampMs: number,
  quoteAgeMs: number | null,
): TobImbalanceQuoteInput {
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

function spreadCents(quote: TobImbalanceQuoteInput): number | null {
  if (quote.yesBestBidCents == null || quote.noBestBidCents == null) {
    return null;
  }
  const ask = deriveYesBestAskCents(quote.noBestBidCents);
  return Math.max(ask - quote.yesBestBidCents, 0);
}

function isOneContractExecutable(sizes: {
  yesBestBidSize: number;
  noBestBidSize: number;
}): boolean {
  return sizes.yesBestBidSize >= 1 && sizes.noBestBidSize >= 1;
}

function median(values: readonly number[]): number | null {
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

export function loadCloseTimeByMarket(
  io: MicrostructureDiscoveryIo,
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
      // Prefer latest metadata row for the ticker.
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
  quote: TobImbalanceQuoteInput;
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

  const exit = resolveComplementExecutablePrices({
    yesBestBidCents: input.quote.yesBestBidCents,
    noBestBidCents: input.quote.noBestBidCents,
  });
  const exitMid = midpointYesCents(input.quote);
  const exitSizesOk =
    input.quote.yesBestBidSize != null
    && input.quote.noBestBidSize != null
    && isOneContractExecutable({
      yesBestBidSize: input.quote.yesBestBidSize,
      noBestBidSize: input.quote.noBestBidSize,
    });
  const entrySizesOk = isOneContractExecutable({
    yesBestBidSize: input.pending.entryYesBidSize,
    noBestBidSize: input.pending.entryNoBidSize,
  });

  const executable =
    exit.executableBuyYesCents != null
    && exit.executableSellYesCents != null
    && entrySizesOk
    && exitSizesOk;

  let signedExec: number | null = null;
  if (executable) {
    signedExec = computeGrossExecutableOneContractPnlCents({
      predictedYesRepricingSign: input.pending.predictedSign,
      entryBuyYesCents: input.pending.entryBuyYesCents,
      entrySellYesCents: input.pending.entrySellYesCents,
      exitBuyYesCents: exit.executableBuyYesCents!,
      exitSellYesCents: exit.executableSellYesCents!,
    });
    cell.executableObservableResponses += 1;
    cell.allSignedExecutable.push(signedExec);
  }

  let signedMid: number | null = null;
  if (input.pending.entryMidCents != null && exitMid != null) {
    signedMid = input.pending.predictedSign * (exitMid - input.pending.entryMidCents);
    cell.allSignedMidpoint.push(signedMid);
  }

  const blockKey = `${input.pending.marketTicker}:${input.pending.tradingDayUtc}`;
  const countsIndependent = !cell.seenIndependentBlock.has(blockKey);
  if (countsIndependent && executable && signedExec != null) {
    cell.seenIndependentBlock.add(blockKey);
    cell.independentSignedExecutable.push(signedExec);
    if (signedMid != null) {
      cell.independentSignedMidpoint.push(signedMid);
    }
    cell.independentMarketKeys.add(input.pending.marketTicker);
    cell.independentMarketDayKeys.add(blockKey);
  }
}

/**
 * Bounded-memory TRAIN TOB stream: per-market first-crossing + refractory + pending response match.
 * Does not retain the full quote history.
 */
export async function streamTrainMicrostructureDiscovery(input: {
  io: MicrostructureDiscoveryIo;
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
  for (const horizon of RESPONSE_HORIZONS_MS) {
    responseObservabilityByHorizonMs.set(horizon, { observable: 0, unobservable: 0 });
  }

  let tobRecordsScanned = 0;
  let validBookQuotes = 0;
  let economicallyValidQuotes = 0;
  let bidSizeAvailableQuotes = 0;
  let firstCrossingEventsTotal = 0;
  let refractoryEpisodesTotal = 0;
  let maxPendingPeak = 0;
  const marketsTouched = new Set<string>();
  const marketDaysTouched = new Set<string>();
  const started = Date.now();

  function getMarketState(ticker: string): MarketStreamState {
    let state = marketState.get(ticker);
    if (!state) {
      state = {
        inThresholdByAbs: new Map(
          IMBALANCE_THRESHOLD_ABS.map((threshold) => [threshold, false] as const),
        ),
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
      if (
        record.yesBestBidSize != null
        && record.noBestBidSize != null
        && Number.isFinite(record.yesBestBidSize)
        && Number.isFinite(record.noBestBidSize)
      ) {
        bidSizeAvailableQuotes += 1;
      }

      const quote = recordToQuoteInput(record, timestampMs, quoteAgeMs);
      // Family gate requires quoteAgeMs; if exchange timestamp missing, use received age 0 proxy
      // only when we still have a resolved timestamp — prefer explicit age when present.
      if (quote.quoteAgeMs == null) {
        quote.quoteAgeMs = 0;
      }

      const state = getMarketState(record.marketTicker);
      marketsTouched.add(record.marketTicker);

      // 1) Match / expire pending responses (strictly after event; no feedback into eligibility).
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
            applyMatchedResponse({
              pending,
              quote,
              cells,
              responseObservabilityByHorizonMs,
            });
            continue;
          }
          stillPending.push(pending);
        }
        state.pending = stillPending;
      }

      const eligibility = isEligibleEventQuote(quote);
      if (!eligibility.eligible) {
        // Invalid books do not update threshold state (M13.0a).
        return "continue";
      }

      const imbalance = computeTobSizeImbalance({
        yesBestBidSize: quote.yesBestBidSize,
        noBestBidSize: quote.noBestBidSize,
      });
      if (!imbalance.ok || imbalance.sign === 0) {
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
      const timeRemainingBin = classifyTimeRemainingBin(timeRemainingMs);
      if (timeRemainingBin == null) {
        // Still update threshold occupancy so later exits/re-entries work.
        for (const threshold of IMBALANCE_THRESHOLD_ABS) {
          const currentlyIn = Math.abs(imbalance.imbalance) >= threshold;
          state.inThresholdByAbs.set(threshold, currentlyIn);
        }
        return "continue";
      }

      const entryExec = resolveComplementExecutablePrices({
        yesBestBidCents: quote.yesBestBidCents,
        noBestBidCents: quote.noBestBidCents,
      });
      if (
        entryExec.executableBuyYesCents == null
        || entryExec.executableSellYesCents == null
        || quote.yesBestBidSize == null
        || quote.noBestBidSize == null
      ) {
        for (const threshold of IMBALANCE_THRESHOLD_ABS) {
          state.inThresholdByAbs.set(threshold, Math.abs(imbalance.imbalance) >= threshold);
        }
        return "continue";
      }

      const predicted = predictedYesRepricingSign(imbalance.sign);
      if (predicted === 0) {
        return "continue";
      }

      const tradingDayUtc = utcTradingDayFromTimestampMs(timestampMs);
      marketDaysTouched.add(`${record.marketTicker}:${tradingDayUtc}`);

      for (const threshold of IMBALANCE_THRESHOLD_ABS) {
        const currentlyIn = Math.abs(imbalance.imbalance) >= threshold;
        const wasIn = state.inThresholdByAbs.get(threshold) ?? false;
        state.inThresholdByAbs.set(threshold, currentlyIn);
        if (!currentlyIn || wasIn) {
          continue;
        }

        firstCrossingEventsTotal += 1;

        for (const horizon of RESPONSE_HORIZONS_MS) {
          const cellKey = buildCellKey({
            imbalanceThresholdAbs: threshold,
            responseHorizonMs: horizon,
            timeRemainingBin,
          });
          const cell = cells.get(cellKey)!;
          cell.rawEvents += 1;

          const refractoryMs = refractoryPeriodMs(horizon);
          const nextEligible = state.nextEligibleMsByCell.get(cellKey) ?? Number.NEGATIVE_INFINITY;
          if (timestampMs < nextEligible) {
            continue;
          }

          cell.refractoryEpisodes += 1;
          refractoryEpisodesTotal += 1;
          state.nextEligibleMsByCell.set(cellKey, timestampMs + refractoryMs);

          const targetMs = timestampMs + horizon;
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
            predictedSign: predicted,
            entryBuyYesCents: entryExec.executableBuyYesCents,
            entrySellYesCents: entryExec.executableSellYesCents,
            entryMidCents: midpointYesCents(quote),
            entrySpreadCents: spreadCents(quote),
            entryYesBidSize: quote.yesBestBidSize,
            entryNoBidSize: quote.noBestBidSize,
          });
        }
      }

      let pendingCount = 0;
      for (const ms of marketState.values()) {
        pendingCount += ms.pending.length;
      }
      if (pendingCount > maxPendingPeak) {
        maxPendingPeak = pendingCount;
      }

      return "continue";
    },
  });

  // Expire remaining pending as unobservable at end of stream.
  for (const state of marketState.values()) {
    for (const pending of state.pending) {
      finalizePendingAsUnobservable(pending, cells, responseObservabilityByHorizonMs);
    }
    state.pending = [];
  }

  // Boundedness proof signal for tests: we never retain all TOB rows.
  const maxQuotesRetainedHint = maxPendingPeak;

  log(
    `TRAIN TOB complete: scanned=${tobRecordsScanned} crossings=${firstCrossingEventsTotal} `
      + `refractoryEpisodes=${refractoryEpisodesTotal} pendingPeak=${maxPendingPeak}`,
  );

  void MAX_EVENT_QUOTE_AGE_MS;

  return {
    cells,
    tobRecordsScanned,
    validBookQuotes,
    economicallyValidQuotes,
    bidSizeAvailableQuotes,
    firstCrossingEventsTotal,
    refractoryEpisodesTotal,
    marketsTouched,
    marketDaysTouched,
    responseObservabilityByHorizonMs,
    maxPendingPeak,
    maxQuotesRetainedHint,
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
