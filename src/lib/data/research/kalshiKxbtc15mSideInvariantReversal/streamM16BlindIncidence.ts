/**
 * P&L-blind M16 incidence / coverage census streamer.
 * File-order TOB (PR #94). Never emits economic exit / P&L fields.
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
import { loadCloseTimeByMarketForBlindIncidence } from "@/lib/data/research/kalshiTobMomentumValidationCohort";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { assertM16BlindIncidenceHasNoOutcomeFields } from "./assertM16BlindNoPnl";
import { assertM16CaptureSetClean } from "./assertM16RejectsContaminatedCaptures";
import { buildM16FamilyDefinition } from "./buildM16FamilyDefinition";
import { buildM16IncidencePlan } from "./buildM16IncidencePlan";
import { decideM16IncidenceFeasibility } from "./m16SampleSizePlanning";
import {
  candidateMidFromYesMid,
  createM16MarketMachine,
  stepM16MarketMachine,
  type M16MarketMachineState,
} from "./m16StateMachine";
import {
  M16_ANALYSIS_VERSION,
  M16_DISCLAIMER,
  M16_MAX_FUTURE_CAPTURE_BUDGET_HOURS,
  M16_SUBFAMILY_ID,
  M16_TARGET_INDEPENDENT_TRADE_N,
  M16ReversalError,
  type M16CaptureDescriptor,
  type M16CandidateSide,
  type M16IncidenceFeasibility,
} from "./m16Types";

export type M16BlindIncidenceReport = {
  analysisVersion: typeof M16_ANALYSIS_VERSION;
  subfamilyId: typeof M16_SUBFAMILY_ID;
  disclaimer: typeof M16_DISCLAIMER;
  familyDefinitionIdentity: string;
  incidencePlanIdentity: string;
  feeContractIdentity: string;
  feeContractStatus: string;
  codeAuthoritySha: string | null;
  generatedAt: string;
  outcomesOpened: false;
  economicExitsInspected: false;
  acceptedCaptureRunIds: readonly string[];
  acceptedCaptureIdentityHashes: readonly string[];
  captureHours: number;
  marketsObserved: number;
  prehistoryCompleteMarkets: number;
  leftTruncatedCount: number;
  downCrossSetupCount: number;
  preConfirmationWaterfallAbortCount: number;
  reversalConfirmedEntryCount: number;
  timeGateEligibleCount: number;
  /** Structural post-entry path present through remaining quotes (no exit label). */
  structurallyCompletePostEntryPathCount: number;
  /** CloseTime known for confirmed entries (terminal flatten evaluable later). */
  terminalCoverageCount: number;
  /**
   * Markets with closeTime in the past relative to capture end — settlement
   * join *may* be attempted later. Does NOT inspect settlement direction.
   */
  settlementCoverableCount: number;
  clusterCount: number;
  clusterUnit: "capture-session";
  usableFutureAnalysisEntryCount: number;
  incidencePerHour: number | null;
  projectedCaptureHoursForTargetN: number | null;
  feasibilityDisposition: M16IncidenceFeasibility;
  feasibilityRationale: string;
  missingnessReasons: readonly string[];
  quarantine: {
    holdoutAccessed: false;
    liveOrders: false;
    pnlOpened: false;
    targetHitInspected: false;
    stopHitInspected: false;
    settlementDirectionInspected: false;
    m14CapturesConsumed: false;
    m15CostFloorConsumed: false;
    btcConditioning: false;
    sizeImbalanceUsed: false;
  };
  reportIdentity: string;
};

type MarketBundle = {
  yes: M16MarketMachineState;
  no: M16MarketMachineState;
  marketClaimed: boolean;
  sawEligibleQuote: boolean;
  confirmedSide: M16CandidateSide | null;
  confirmationTs: number | null;
  quotesAfterConfirmation: number;
  closeTimeMs: number | null;
  structuralGapSeen: boolean;
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

function isStructuralGapBook(bookState: string | null): boolean {
  return (
    bookState === "gap-detected"
    || bookState === "resyncing"
    || bookState === "awaiting-snapshot"
  );
}

export async function streamM16BlindIncidenceFromCaptures(input: {
  io: MomentumDiscoveryIo;
  captures: readonly M16CaptureDescriptor[];
  codeAuthoritySha?: string | null;
  generatedAt?: string;
  log?: (message: string) => void;
}): Promise<M16BlindIncidenceReport> {
  assertM16CaptureSetClean(input.captures);
  const family = buildM16FamilyDefinition();
  const plan = buildM16IncidencePlan();
  if (plan.familyDefinitionIdentity !== family.familyDefinitionIdentity) {
    throw new M16ReversalError("incidence plan / family definition identity mismatch");
  }

  const log = input.log ?? (() => {});
  const ordered = [...input.captures].sort((a, b) => a.runId.localeCompare(b.runId));

  let marketsObserved = 0;
  let leftTruncatedCount = 0;
  let downCrossSetupCount = 0;
  let preConfirmationWaterfallAbortCount = 0;
  let reversalConfirmedEntryCount = 0;
  let timeGateEligibleCount = 0;
  let structurallyCompletePostEntryPathCount = 0;
  let terminalCoverageCount = 0;
  let settlementCoverableCount = 0;
  let prehistoryCompleteMarkets = 0;
  let captureHours = 0;
  const missingness = new Set<string>();
  const clusterIds = new Set<string>();

  for (const capture of ordered) {
    const tobPath = join(capture.captureRunDir, "top-of-book.jsonl");
    if (!input.io.fileExists(tobPath)) {
      throw new M16ReversalError(`top-of-book missing: ${tobPath}`);
    }
    clusterIds.add(capture.runId); // capture-session cluster
    const closeByMarket = loadCloseTimeByMarketForBlindIncidence(
      input.io,
      capture.captureRunDir,
    );

    const markets = new Map<string, MarketBundle>();
    let firstTs: number | null = null;
    let lastTs: number | null = null;
    let lines = 0;
    const started = Date.now();

    function getBundle(ticker: string): MarketBundle {
      let bundle = markets.get(ticker);
      if (!bundle) {
        bundle = {
          yes: createM16MarketMachine("YES"),
          no: createM16MarketMachine("NO"),
          marketClaimed: false,
          sawEligibleQuote: false,
          confirmedSide: null,
          confirmationTs: null,
          quotesAfterConfirmation: 0,
          closeTimeMs: closeByMarket.get(ticker) ?? null,
          structuralGapSeen: false,
        };
        markets.set(ticker, bundle);
      }
      return bundle;
    }

    await input.io.iterateJsonl(tobPath, {
      onLine: (line, meta) => {
        lines += 1;
        if (lines === 1 || lines % 500_000 === 0) {
          log(
            `M16 TOB stream [${capture.runId}]: ${lines} lines after `
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
        firstTs = firstTs == null ? timestampMs : Math.min(firstTs, timestampMs);
        lastTs = lastTs == null ? timestampMs : Math.max(lastTs, timestampMs);

        const quoteAgeMs =
          record.exchangeTimestampMs != null
            ? Math.max(record.receivedAtMs - record.exchangeTimestampMs, 0)
            : 0;
        const quote = recordToQuote(record, timestampMs, quoteAgeMs);
        const yesMid = midpointFromQuote(quote);
        const eligible = isEligibleEventQuote(quote).eligible && yesMid != null;
        const gap = isStructuralGapBook(record.bookState);
        const bundle = getBundle(record.marketTicker);

        if (gap) {
          bundle.structuralGapSeen = true;
        }

        if (bundle.confirmedSide != null) {
          if (eligible) {
            bundle.quotesAfterConfirmation += 1;
          }
          return "continue";
        }

        if (bundle.marketClaimed) {
          return "continue";
        }

        if (!eligible || yesMid == null || record.yesBestBidCents == null || record.noBestBidCents == null) {
          // Still propagate gap invalidation for active setups
          if (gap) {
            for (const side of ["YES", "NO"] as const) {
              const machine = side === "YES" ? bundle.yes : bundle.no;
              if (
                machine.phase === "in-setup"
                || machine.phase === "building-reversal"
                || machine.phase === "pullback-held"
              ) {
                const tick = {
                  timestampMs,
                  yesBestBidCents: record.yesBestBidCents ?? 0,
                  noBestBidCents: record.noBestBidCents ?? 0,
                  candidateMidCents: candidateMidFromYesMid(side, yesMid ?? 50),
                  bookEligible: false,
                  structuralGap: true,
                };
                const stepped = stepM16MarketMachine({
                  state: machine,
                  tick,
                  closeTimeMs: bundle.closeTimeMs,
                });
                if (side === "YES") bundle.yes = stepped.state;
                else bundle.no = stepped.state;
              }
            }
          }
          return "continue";
        }

        bundle.sawEligibleQuote = true;

        for (const side of ["YES", "NO"] as const) {
          if (bundle.marketClaimed) break;
          const machine = side === "YES" ? bundle.yes : bundle.no;
          const candidateMid = candidateMidFromYesMid(side, yesMid);
          const stepped = stepM16MarketMachine({
            state: machine,
            tick: {
              timestampMs,
              yesBestBidCents: record.yesBestBidCents,
              noBestBidCents: record.noBestBidCents,
              candidateMidCents: candidateMid,
              bookEligible: true,
              structuralGap: gap,
            },
            closeTimeMs: bundle.closeTimeMs,
          });
          if (side === "YES") bundle.yes = stepped.state;
          else bundle.no = stepped.state;

          for (const event of stepped.events) {
            if (event.type === "left-truncated") {
              leftTruncatedCount += 1;
            } else if (event.type === "down-cross") {
              downCrossSetupCount += 1;
            } else if (event.type === "abort-waterfall") {
              preConfirmationWaterfallAbortCount += 1;
            } else if (event.type === "confirmation") {
              reversalConfirmedEntryCount += 1;
              timeGateEligibleCount += 1;
              bundle.marketClaimed = true;
              bundle.confirmedSide = side;
              bundle.confirmationTs = event.timestampMs;
            } else if (event.type === "time-gate-reject") {
              reversalConfirmedEntryCount += 1; // structural confirmation observed
              bundle.marketClaimed = true;
              bundle.confirmedSide = side;
              bundle.confirmationTs = event.timestampMs;
              missingness.add("time-gate-reject");
            } else if (event.type === "invalidated-gap") {
              missingness.add("structural-gap-invalidation");
            }
          }
        }

        return "continue";
      },
    });

    marketsObserved += markets.size;
    for (const bundle of markets.values()) {
      const yesSaw = bundle.yes.sawAboveCross;
      const noSaw = bundle.no.sawAboveCross;
      if (yesSaw || noSaw) {
        prehistoryCompleteMarkets += 1;
      }
      if (bundle.confirmedSide != null && bundle.confirmationTs != null) {
        if (bundle.quotesAfterConfirmation > 0) {
          structurallyCompletePostEntryPathCount += 1;
        } else {
          missingness.add("no-post-confirmation-quotes");
        }
        if (bundle.closeTimeMs != null) {
          terminalCoverageCount += 1;
          if (lastTs != null && bundle.closeTimeMs <= lastTs) {
            settlementCoverableCount += 1;
          }
        } else {
          missingness.add("missing-closeTime");
        }
      }
    }

    if (firstTs != null && lastTs != null && lastTs > firstTs) {
      captureHours += (lastTs - firstTs) / 3_600_000;
    }
    log(`M16 TOB complete [${capture.runId}]: scanned=${lines} markets=${markets.size}`);
  }

  const usableFutureAnalysisEntryCount = timeGateEligibleCount;
  const incidencePerHour =
    captureHours > 0 ? usableFutureAnalysisEntryCount / captureHours : null;
  const projectedCaptureHoursForTargetN =
    incidencePerHour != null && incidencePerHour > 0
      ? M16_TARGET_INDEPENDENT_TRADE_N / incidencePerHour
      : null;
  const { disposition, rationale } = decideM16IncidenceFeasibility({
    projectedCaptureHoursForTargetN,
    maxBudgetHours: M16_MAX_FUTURE_CAPTURE_BUDGET_HOURS,
    usableEntryCount: usableFutureAnalysisEntryCount,
  });

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const reportBase = {
    analysisVersion: M16_ANALYSIS_VERSION,
    subfamilyId: M16_SUBFAMILY_ID,
    disclaimer: M16_DISCLAIMER,
    familyDefinitionIdentity: family.familyDefinitionIdentity,
    incidencePlanIdentity: plan.incidencePlanIdentity,
    feeContractIdentity: family.feeContract.feeContractIdentity,
    feeContractStatus: family.feeContract.feeContractStatus,
    codeAuthoritySha: input.codeAuthoritySha ?? null,
    generatedAt,
    outcomesOpened: false as const,
    economicExitsInspected: false as const,
    acceptedCaptureRunIds: ordered.map((c) => c.runId),
    acceptedCaptureIdentityHashes: ordered.map((c) => c.captureIdentityHash),
    captureHours,
    marketsObserved,
    prehistoryCompleteMarkets,
    leftTruncatedCount,
    downCrossSetupCount,
    preConfirmationWaterfallAbortCount,
    reversalConfirmedEntryCount,
    timeGateEligibleCount,
    structurallyCompletePostEntryPathCount,
    terminalCoverageCount,
    settlementCoverableCount,
    clusterCount: clusterIds.size,
    clusterUnit: "capture-session" as const,
    usableFutureAnalysisEntryCount,
    incidencePerHour,
    projectedCaptureHoursForTargetN,
    feasibilityDisposition: disposition,
    feasibilityRationale: rationale,
    missingnessReasons: [...missingness].sort((a, b) => a.localeCompare(b)),
    quarantine: {
      holdoutAccessed: false as const,
      liveOrders: false as const,
      pnlOpened: false as const,
      targetHitInspected: false as const,
      stopHitInspected: false as const,
      settlementDirectionInspected: false as const,
      m14CapturesConsumed: false as const,
      m15CostFloorConsumed: false as const,
      btcConditioning: false as const,
      sizeImbalanceUsed: false as const,
    },
  };

  assertM16BlindIncidenceHasNoOutcomeFields(reportBase);

  const reportIdentity = createHash("sha256")
    .update(stableStringify(reportBase))
    .digest("hex");

  return { ...reportBase, reportIdentity };
}
