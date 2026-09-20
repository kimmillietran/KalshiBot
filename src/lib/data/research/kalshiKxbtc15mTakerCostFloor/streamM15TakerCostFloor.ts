/**
 * Bounded-memory M15 cost-floor streamer.
 * Causal order = JSONL file/append order (PR #94). No signal/P&L fields.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";

import type { ParsedTopOfBookRecord } from "@/lib/data/research/captureHealthAudit/captureHealthAuditTypes";
import { parseTopOfBookLine } from "@/lib/data/research/captureHealthAudit/parseCaptureHealthRecords";
import { resolveKalshiTimestampMs } from "@/lib/data/research/btcKalshiLeadLagAnalysis/leadLagUtils";
import type { MomentumDiscoveryIo } from "@/lib/data/research/kalshiTobMomentumDiscovery/momentumDiscoveryTypes";
import {
  isEligibleEventQuote,
  midpointFromQuote,
  type MomentumQuoteInput,
} from "@/lib/data/research/kalshiTobMomentumFamily";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  aggregateAcrossMarketDays,
  aggregateHurdlesByMarketDayHorizon,
  decideM15ProgramDecision,
} from "./m15AggregateAndDecide";
import { assertM15CaptureSetClean } from "./assertM15RejectsM14ValidationCaptures";
import { buildM15StudyDefinition } from "./buildM15StudyDefinition";
import { computeYesTakerRoundTripHurdle } from "./m15CostFloorEconomics";
import { assertM15FeeContractMatches } from "./m15FeeApplication";
import {
  buildM15IndependentUnitKey,
  m15CadenceBucket,
  m15TradingDayUtc,
} from "./m15OrdinaryQuoteSampler";
import {
  M15_HORIZONS_MS,
  M15_RESPONSE_MATCH_TOLERANCE_MS,
  M15_SAMPLE_CADENCE_MS,
  M15_STUDY_ANALYSIS_VERSION,
  M15_STUDY_NAME,
  M15_DISCLAIMER,
  M15_HISTORICAL_EFFECT_SCALE_CENTS,
  M15_DECISION_HORIZON_MS,
  M15_TARGET_INDEPENDENT_MARKET_DAYS,
  M15CostFloorError,
  type M15CaptureDescriptor,
  type M15CostFloorReport,
  type M15HorizonMs,
  type M15QuoteSampleHurdle,
} from "./m15CostFloorTypes";

type PendingResponse = {
  horizonMs: M15HorizonMs;
  marketTicker: string;
  tradingDayUtc: string;
  entryTimestampMs: number;
  targetMs: number;
  upperBoundMs: number;
  entryQuote: MomentumQuoteInput;
};

type MarketState = {
  lastCadenceBucket: number;
  pending: PendingResponse[];
  lastTimestampMs: number;
};

function recordToQuote(
  record: ParsedTopOfBookRecord,
  timestampMs: number,
  quoteAgeMs: number,
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

function isEligibleCostFloorQuote(quote: MomentumQuoteInput): boolean {
  const eligibility = isEligibleEventQuote(quote);
  if (!eligibility.eligible) return false;
  return midpointFromQuote(quote) != null;
}

export async function streamM15TakerCostFloorFromCaptures(input: {
  io: MomentumDiscoveryIo;
  captures: readonly M15CaptureDescriptor[];
  expectedFeeContractIdentity?: string;
  codeAuthoritySha?: string | null;
  generatedAt?: string;
  verifyCaptureIdentity?: (input: {
    runId: string;
    captureRunDir: string;
  }) => Promise<string>;
  log?: (message: string) => void;
}): Promise<M15CostFloorReport> {
  assertM15CaptureSetClean(input.captures);
  const study = buildM15StudyDefinition();
  const fee = assertM15FeeContractMatches(
    input.expectedFeeContractIdentity ?? study.feeContract.feeContractIdentity,
  );

  const hurdles: M15QuoteSampleHurdle[] = [];
  let rawSampleAttempts = 0;
  let unobservableMissingResponse = 0;
  let unobservableInvalidBooks = 0;
  const log = input.log ?? (() => {});

  const ordered = [...input.captures].sort((a, b) => a.runId.localeCompare(b.runId));

  for (const capture of ordered) {
    if (input.verifyCaptureIdentity) {
      const actual = await input.verifyCaptureIdentity({
        runId: capture.runId,
        captureRunDir: capture.captureRunDir,
      });
      if (actual !== capture.captureIdentityHash) {
        throw new M15CostFloorError(
          `capture identity mismatch for ${capture.runId}: `
            + `expected ${capture.captureIdentityHash}, got ${actual}`,
        );
      }
    }

    const tobPath = join(capture.captureRunDir, "top-of-book.jsonl");
    if (!input.io.fileExists(tobPath)) {
      throw new M15CostFloorError(`top-of-book missing: ${tobPath}`);
    }

    const marketState = new Map<string, MarketState>();
    let lines = 0;
    const started = Date.now();

    function getState(ticker: string): MarketState {
      let state = marketState.get(ticker);
      if (!state) {
        state = {
          lastCadenceBucket: Number.NEGATIVE_INFINITY,
          pending: [],
          lastTimestampMs: Number.NEGATIVE_INFINITY,
        };
        marketState.set(ticker, state);
      }
      return state;
    }

    function finalizePending(pending: PendingResponse, matched: MomentumQuoteInput | null): void {
      if (matched == null) {
        unobservableMissingResponse += 1;
        return;
      }
      const hurdle = computeYesTakerRoundTripHurdle({
        entryQuote: pending.entryQuote,
        exitQuote: matched,
      });
      if (hurdle == null) {
        unobservableInvalidBooks += 1;
        return;
      }
      hurdles.push({
        marketTicker: pending.marketTicker,
        tradingDayUtc: pending.tradingDayUtc,
        horizonMs: pending.horizonMs,
        entryTimestampMs: pending.entryTimestampMs,
        exitTimestampMs: matched.timestampMs,
        spreadOnlyHurdleCents: hurdle.spreadOnlyHurdleCents,
        entryFeeCents: hurdle.entryFeeCents,
        exitFeeCents: hurdle.exitFeeCents,
        totalFeeCents: hurdle.totalFeeCents,
        feeInclusiveHurdleCents: hurdle.feeInclusiveHurdleCents,
      });
    }

    await input.io.iterateJsonl(tobPath, {
      onLine: (line, meta) => {
        lines += 1;
        if (lines === 1 || lines % 500_000 === 0) {
          log(
            `M15 TOB stream [${capture.runId}]: ${lines} lines after `
              + `${((Date.now() - started) / 1000).toFixed(1)}s`,
          );
        }
        let record: ParsedTopOfBookRecord | null;
        try {
          record = parseTopOfBookLine(line, meta.lineNumber);
        } catch {
          return "continue";
        }
        if (!record) return "continue";

        const timestampMs = resolveKalshiTimestampMs({
          receivedAtMs: record.receivedAtMs,
          exchangeTimestampMs: record.exchangeTimestampMs,
        });
        // Quote age = receive lag vs exchange stamp (staleness gate). Distinct from
        // event clock used for H matching (resolveKalshiTimestampMs / PR #94).
        const quoteAgeMs =
          record.exchangeTimestampMs != null
            ? Math.max(record.receivedAtMs - record.exchangeTimestampMs, 0)
            : 0;
        const quote = recordToQuote(record, timestampMs, quoteAgeMs);
        const state = getState(record.marketTicker);

        // File-order causality (PR #94): do not hard-fail on event-time regressions.
        if (timestampMs < state.lastTimestampMs) {
          // Keep processing; capture contract is JSONL append order.
        } else {
          state.lastTimestampMs = timestampMs;
        }

        if (state.pending.length > 0) {
          const still: PendingResponse[] = [];
          for (const pending of state.pending) {
            if (timestampMs <= pending.entryTimestampMs) {
              still.push(pending);
              continue;
            }
            if (timestampMs > pending.upperBoundMs) {
              finalizePending(pending, null);
              continue;
            }
            if (timestampMs >= pending.targetMs && timestampMs <= pending.upperBoundMs) {
              if (isEligibleCostFloorQuote(quote)) {
                finalizePending(pending, quote);
                continue;
              }
              still.push(pending);
              continue;
            }
            still.push(pending);
          }
          state.pending = still;
        }

        if (!isEligibleCostFloorQuote(quote)) {
          return "continue";
        }

        const bucket = m15CadenceBucket(timestampMs, M15_SAMPLE_CADENCE_MS);
        if (bucket <= state.lastCadenceBucket) {
          return "continue";
        }
        state.lastCadenceBucket = bucket;
        rawSampleAttempts += 1;

        const tradingDayUtc = m15TradingDayUtc(timestampMs);
        for (const horizonMs of M15_HORIZONS_MS) {
          const targetMs = timestampMs + horizonMs;
          const upperBoundMs = targetMs + M15_RESPONSE_MATCH_TOLERANCE_MS;
          state.pending.push({
            horizonMs,
            marketTicker: record.marketTicker,
            tradingDayUtc,
            entryTimestampMs: timestampMs,
            targetMs,
            upperBoundMs,
            entryQuote: quote,
          });
        }
        return "continue";
      },
    });

    for (const state of marketState.values()) {
      for (const pending of state.pending) {
        finalizePending(pending, null);
      }
      state.pending = [];
    }

    log(`M15 TOB complete [${capture.runId}]: scanned=${lines}`);
  }

  const summaries = aggregateHurdlesByMarketDayHorizon(hurdles);
  const perHorizon = aggregateAcrossMarketDays(summaries);
  const { decision, rationale } = decideM15ProgramDecision({
    perHorizon,
    minIndependentMarketDays: Math.min(M15_TARGET_INDEPENDENT_MARKET_DAYS, 1),
  });

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const reportBase = {
    analysisVersion: M15_STUDY_ANALYSIS_VERSION,
    studyId: M15_STUDY_NAME,
    disclaimer: M15_DISCLAIMER,
    studyDefinitionIdentity: study.studyDefinitionIdentity,
    feeContract: fee,
    codeAuthoritySha: input.codeAuthoritySha ?? null,
    generatedAt,
    acceptedCaptureRunIds: ordered.map((c) => c.runId),
    acceptedCaptureIdentityHashes: ordered.map((c) => c.captureIdentityHash),
    horizonsMs: M15_HORIZONS_MS,
    sampleCadenceMs: M15_SAMPLE_CADENCE_MS,
    independentUnit: "marketTicker-x-utc-calendar-day" as const,
    canonicalRoundTrip: "yes-taker-complement-symmetric-to-no" as const,
    historicalEffectScaleCents: M15_HISTORICAL_EFFECT_SCALE_CENTS,
    decisionHorizonMs: M15_DECISION_HORIZON_MS,
    programDecision: decision,
    programDecisionRationale: rationale,
    perHorizon,
    observability: {
      rawSampleAttempts,
      observablePairs: hurdles.length,
      unobservableMissingResponse,
      unobservableInvalidBooks,
    },
    m14Contamination: {
      m14ValidationEventsConsumed: false as const,
      m14ValidationCapturesRejected: true as const,
      m14Closed: true as const,
      m14Status: "validation-failed" as const,
      m14NextAction: "stop-lineage" as const,
    },
    quarantine: {
      holdoutAccessed: false as const,
      liveOrders: false as const,
      signalAnalysisPerformed: false as const,
      momentumEventConditioning: false as const,
    },
  };

  const reportIdentity = createHash("sha256")
    .update(stableStringify(reportBase))
    .digest("hex");

  return { ...reportBase, reportIdentity };
}

export function listM15IndependentUnits(
  hurdles: readonly M15QuoteSampleHurdle[],
): string[] {
  return [...new Set(
    hurdles.map((h) =>
      buildM15IndependentUnitKey({
        marketTicker: h.marketTicker,
        tradingDayUtc: h.tradingDayUtc,
      })
    ),
  )].sort((a, b) => a.localeCompare(b));
}
