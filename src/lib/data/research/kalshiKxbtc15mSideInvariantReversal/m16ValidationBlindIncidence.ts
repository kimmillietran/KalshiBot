/**
 * M16.2 P&L-blind validation incidence streamer.
 * Structural eligible-confirmation units only — never economic exits.
 * Separate from streamM16BlindIncidenceFromCaptures to avoid changing M16.0 reportIdentity.
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
import {
  hashCaptureTopOfBookIdentity,
  loadCloseTimeByMarketForBlindIncidence,
} from "@/lib/data/research/kalshiTobMomentumValidationCohort";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { assertM16BlindIncidenceHasNoOutcomeFields } from "./assertM16BlindNoPnl";
import { assertM16CaptureNotContaminated } from "./assertM16RejectsContaminatedCaptures";
import { m16UtcDayKey } from "./m16DependencePlan";
import {
  candidateMidFromYesMid,
  createM16MarketMachine,
  stepM16MarketMachine,
  type M16MarketMachineState,
} from "./m16StateMachine";
import type { M16CandidateSide, M16CaptureDescriptor } from "./m16Types";
import {
  M16ValidationCollectionError,
  type M16EligibleConfirmationUnit,
  type M16ValidationBlindIncidence,
} from "./m16ValidationCohortTypes";

type MarketBundle = {
  yes: M16MarketMachineState;
  no: M16MarketMachineState;
  marketClaimed: boolean;
  confirmedSide: M16CandidateSide | null;
  confirmationTs: number | null;
  timeGateEligible: boolean;
  quotesAfterConfirmation: number;
  closeTimeMs: number | null;
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

export async function streamM16ValidationBlindIncidence(input: {
  io: MomentumDiscoveryIo;
  runId: string;
  captureRunDir: string;
  captureIdentityHash?: string;
  researchRole?: M16CaptureDescriptor["researchRole"];
  priorResearchRole?: string | null;
}): Promise<M16ValidationBlindIncidence> {
  assertM16CaptureNotContaminated({
    runId: input.runId,
    captureRunDir: input.captureRunDir,
    captureIdentityHash: input.captureIdentityHash ?? "pending",
    researchRole: input.researchRole ?? "m16-prospective-validation",
    priorResearchRole: input.priorResearchRole ?? null,
  });

  const tobPath = join(input.captureRunDir, "top-of-book.jsonl");
  if (!input.io.fileExists(tobPath)) {
    throw new M16ValidationCollectionError(`top-of-book missing: ${tobPath}`);
  }

  let captureIdentityHash = input.captureIdentityHash ?? "";
  try {
    captureIdentityHash = await hashCaptureTopOfBookIdentity(tobPath);
  } catch {
    if (!input.captureIdentityHash) {
      throw new M16ValidationCollectionError(
        "capture identity hash required when filesystem hash unavailable",
      );
    }
    captureIdentityHash = input.captureIdentityHash;
  }
  if (input.captureIdentityHash && input.captureIdentityHash !== captureIdentityHash) {
    throw new M16ValidationCollectionError(
      `capture identity mismatch: expected ${input.captureIdentityHash}, `
        + `got ${captureIdentityHash}`,
    );
  }

  const closeByMarket = loadCloseTimeByMarketForBlindIncidence(
    input.io,
    input.captureRunDir,
  );
  const markets = new Map<string, MarketBundle>();
  let leftTruncatedSideEventCount = 0;
  let downCrossSetupSideEventCount = 0;
  let preConfirmationWaterfallAbortSideEventCount = 0;
  let reversalConfirmedEntryCount = 0;
  let timeGateEligibleCount = 0;
  let structurallyCompletePostEntryPathCount = 0;
  let prehistoryCompleteMarkets = 0;
  let firstTs: number | null = null;
  let lastTs: number | null = null;
  const eligibleUnits: M16EligibleConfirmationUnit[] = [];

  function getBundle(ticker: string): MarketBundle {
    let bundle = markets.get(ticker);
    if (!bundle) {
      bundle = {
        yes: createM16MarketMachine("YES"),
        no: createM16MarketMachine("NO"),
        marketClaimed: false,
        confirmedSide: null,
        confirmationTs: null,
        timeGateEligible: false,
        quotesAfterConfirmation: 0,
        closeTimeMs: closeByMarket.get(ticker) ?? null,
      };
      markets.set(ticker, bundle);
    }
    return bundle;
  }

  await input.io.iterateJsonl(tobPath, {
    onLine: (line, meta) => {
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

      if (bundle.confirmedSide != null) {
        if (eligible) bundle.quotesAfterConfirmation += 1;
        return "continue";
      }
      if (bundle.marketClaimed) return "continue";

      if (
        !eligible
        || yesMid == null
        || record.yesBestBidCents == null
        || record.noBestBidCents == null
      ) {
        return "continue";
      }

      for (const side of ["YES", "NO"] as const) {
        if (bundle.marketClaimed) break;
        const machine = side === "YES" ? bundle.yes : bundle.no;
        const stepped = stepM16MarketMachine({
          state: machine,
          tick: {
            timestampMs,
            yesBestBidCents: record.yesBestBidCents,
            noBestBidCents: record.noBestBidCents,
            candidateMidCents: candidateMidFromYesMid(side, yesMid),
            bookEligible: true,
            structuralGap: gap,
          },
          closeTimeMs: bundle.closeTimeMs,
        });
        if (side === "YES") bundle.yes = stepped.state;
        else bundle.no = stepped.state;

        for (const event of stepped.events) {
          if (event.type === "left-truncated") leftTruncatedSideEventCount += 1;
          else if (event.type === "down-cross") downCrossSetupSideEventCount += 1;
          else if (event.type === "abort-waterfall") {
            preConfirmationWaterfallAbortSideEventCount += 1;
          } else if (event.type === "confirmation") {
            reversalConfirmedEntryCount += 1;
            timeGateEligibleCount += 1;
            bundle.marketClaimed = true;
            bundle.confirmedSide = side;
            bundle.confirmationTs = event.timestampMs;
            bundle.timeGateEligible = true;
            eligibleUnits.push({
              marketTicker: record.marketTicker,
              confirmationTimestampMs: event.timestampMs,
              utcDayKey: m16UtcDayKey(event.timestampMs),
              observedInRunId: input.runId,
            });
          } else if (event.type === "time-gate-reject") {
            reversalConfirmedEntryCount += 1;
            bundle.marketClaimed = true;
            bundle.confirmedSide = side;
            bundle.confirmationTs = event.timestampMs;
            bundle.timeGateEligible = false;
          }
        }
      }
      return "continue";
    },
  });

  for (const bundle of markets.values()) {
    if (bundle.yes.sawAboveCross || bundle.no.sawAboveCross) {
      prehistoryCompleteMarkets += 1;
    }
    if (bundle.confirmedSide != null && bundle.timeGateEligible) {
      if (bundle.quotesAfterConfirmation > 0) {
        structurallyCompletePostEntryPathCount += 1;
      }
    }
  }

  const captureHours =
    firstTs != null && lastTs != null && lastTs > firstTs
      ? (lastTs - firstTs) / 3_600_000
      : 0;

  const eligibleUtcDayKeysRaw = [
    ...new Set(eligibleUnits.map((u) => u.utcDayKey)),
  ].sort((a, b) => a.localeCompare(b));

  const reportBase = {
    runId: input.runId,
    captureIdentityHash,
    marketsObserved: markets.size,
    prehistoryCompleteMarkets,
    leftTruncatedSideEventCount,
    downCrossSetupSideEventCount,
    preConfirmationWaterfallAbortSideEventCount,
    reversalConfirmedEntryCount,
    timeGateEligibleCount,
    structurallyCompletePostEntryPathCount,
    eligibleUnits,
    eligibleTradeCountRaw: eligibleUnits.length,
    eligibleUtcDayKeysRaw,
    captureHours,
    outcomesOpened: false as const,
    quarantine: {
      pnlOpened: false as const,
      targetHitInspected: false as const,
      stopHitInspected: false as const,
      settlementDirectionInspected: false as const,
    },
  };

  assertM16BlindIncidenceHasNoOutcomeFields(reportBase);

  const blindIncidenceIdentity = createHash("sha256")
    .update(stableStringify(reportBase))
    .digest("hex");

  return { ...reportBase, blindIncidenceIdentity };
}

/** Synthetic fixture helper for registry tests (no TOB IO). */
export function buildSyntheticM16ValidationBlindIncidence(input: {
  runId: string;
  captureIdentityHash: string;
  eligibleUnits?: readonly M16EligibleConfirmationUnit[];
  captureHours?: number;
}): M16ValidationBlindIncidence {
  const eligibleUnits = [...(input.eligibleUnits ?? [])];
  const eligibleUtcDayKeysRaw = [
    ...new Set(eligibleUnits.map((u) => u.utcDayKey)),
  ].sort((a, b) => a.localeCompare(b));
  const reportBase = {
    runId: input.runId,
    captureIdentityHash: input.captureIdentityHash,
    marketsObserved: eligibleUnits.length,
    prehistoryCompleteMarkets: eligibleUnits.length,
    leftTruncatedSideEventCount: 0,
    downCrossSetupSideEventCount: 0,
    preConfirmationWaterfallAbortSideEventCount: 0,
    reversalConfirmedEntryCount: eligibleUnits.length,
    timeGateEligibleCount: eligibleUnits.length,
    structurallyCompletePostEntryPathCount: eligibleUnits.length,
    eligibleUnits,
    eligibleTradeCountRaw: eligibleUnits.length,
    eligibleUtcDayKeysRaw,
    captureHours: input.captureHours ?? 4,
    outcomesOpened: false as const,
    quarantine: {
      pnlOpened: false as const,
      targetHitInspected: false as const,
      stopHitInspected: false as const,
      settlementDirectionInspected: false as const,
    },
  };
  assertM16BlindIncidenceHasNoOutcomeFields(reportBase);
  return {
    ...reportBase,
    blindIncidenceIdentity: createHash("sha256")
      .update(stableStringify(reportBase))
      .digest("hex"),
  };
}
