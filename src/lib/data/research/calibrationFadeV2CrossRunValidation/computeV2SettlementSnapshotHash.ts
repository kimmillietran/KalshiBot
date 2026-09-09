import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import type { UniqueCandidateMarket } from "../calibrationFadeCrossRunValidation/calibrationFadeCrossRunValidationTypes";

export const V2_SETTLEMENT_SNAPSHOT_ANALYSIS_VERSION =
  "calibration-fade-v2-settlement-snapshot-v1" as const;

export type V2SettlementSnapshotCandidate = {
  marketTicker: string;
  settlementStatus: string;
  settledOutcome: "yes" | "no" | "unknown";
  calibrationGapSigned: number | null;
  grossReturnCents: number | null;
  feeAdjustedReturnCents: number | null;
  evaluated: boolean;
};

export type V2SettlementSnapshotPayload = {
  analysisVersion: typeof V2_SETTLEMENT_SNAPSHOT_ANALYSIS_VERSION;
  evidenceMode: "confirmatory";
  runSetHash: string;
  candidates: readonly V2SettlementSnapshotCandidate[];
};

/**
 * Canonical settlement-overlay semantic state for the admitted/deduplicated
 * candidate set. Order-invariant; excludes generation timestamps and mtime.
 */
export function buildV2SettlementSnapshotPayload(input: {
  runSetHash: string;
  uniqueMarkets: readonly UniqueCandidateMarket[];
}): V2SettlementSnapshotPayload {
  const candidates = [...input.uniqueMarkets]
    .map((market) => {
      const entry = market.selectedCanonicalEntry;
      return {
        marketTicker: market.marketTicker,
        settlementStatus: entry.settlementStatus,
        settledOutcome: entry.settledOutcome,
        calibrationGapSigned: entry.calibrationGapSigned,
        grossReturnCents: entry.grossReturnCents,
        feeAdjustedReturnCents: entry.feeAdjustedReturnCents,
        evaluated: market.evaluated,
      } satisfies V2SettlementSnapshotCandidate;
    })
    .sort((left, right) => left.marketTicker.localeCompare(right.marketTicker));

  return {
    analysisVersion: V2_SETTLEMENT_SNAPSHOT_ANALYSIS_VERSION,
    evidenceMode: "confirmatory",
    runSetHash: input.runSetHash,
    candidates,
  };
}

export function computeV2SettlementSnapshotHash(input: {
  runSetHash: string;
  uniqueMarkets: readonly UniqueCandidateMarket[];
}): { settlementSnapshotHash: string; payload: V2SettlementSnapshotPayload } {
  const payload = buildV2SettlementSnapshotPayload(input);
  return {
    settlementSnapshotHash: fnv1a32(stableStringify(payload)),
    payload,
  };
}
