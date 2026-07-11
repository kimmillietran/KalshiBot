import {
  choosePreferredSettlementCandidate,
  detectSettlementConflicts,
  loadMarketImportSettlementState,
} from "./loadMarketImportSettlementState";
import { resolveSeriesTicker } from "@/lib/data/audit/settlementTrace/settlementTraceUtils";
import type {
  CapturedMarketInventoryEntry,
  ForwardSettlementCoverageIo,
  MarketSettlementCoverageEntry,
  SettlementCoverageClassification,
} from "./forwardSettlementCoverageTypes";

function addHours(isoTimestamp: string, hours: number): string {
  return new Date(Date.parse(isoTimestamp) + hours * 60 * 60 * 1000).toISOString();
}

function isSettlementStale(input: {
  retrievedAt: string | null;
  lastObservedAt: string;
  marketCloseTime: string | null;
  evaluatedAt: string;
}): boolean {
  if (!input.retrievedAt) {
    return false;
  }

  const retrievedMs = Date.parse(input.retrievedAt);
  const lastObservedMs = Date.parse(input.lastObservedAt);
  const evaluatedMs = Date.parse(input.evaluatedAt);
  const closeMs = input.marketCloseTime ? Date.parse(input.marketCloseTime) : Number.NaN;

  if (!Number.isFinite(retrievedMs) || !Number.isFinite(lastObservedMs)) {
    return false;
  }

  if (Number.isFinite(closeMs) && closeMs > evaluatedMs) {
    return false;
  }

  return retrievedMs < lastObservedMs;
}

/** Classifies settlement coverage for one captured market. */
export function classifyMarketSettlementCoverage(input: {
  io: ForwardSettlementCoverageIo;
  importsDir: string;
  inventory: CapturedMarketInventoryEntry;
  evaluatedAt: string;
  staleAfterCaptureObservation: boolean;
}): MarketSettlementCoverageEntry {
  const importState = loadMarketImportSettlementState({
    io: input.io,
    importsDir: input.importsDir,
    marketTicker: input.inventory.marketTicker,
    seriesTicker: resolveSeriesTicker(input.inventory.marketTicker),
  });

  const closeTime =
    input.inventory.marketCloseTime
    ?? importState.marketMetadataCloseTime
    ?? importState.candidates[0]?.closeTime
    ?? null;

  const evaluatedMs = Date.parse(input.evaluatedAt);
  const closeMs = closeTime ? Date.parse(closeTime) : Number.NaN;
  const marketNotYetSettled =
    Number.isFinite(closeMs) && closeMs > evaluatedMs;

  if (importState.importFailed) {
    return {
      marketTicker: input.inventory.marketTicker,
      seriesTicker: input.inventory.seriesTicker,
      classification: "import-failed",
      settledOutcome: "unknown",
      settlementTime: null,
      sourceArtifact: importState.importResultPath,
      retrievedAt: importState.retrievedAt,
      conflictReason: null,
      exclusionReason: importState.importErrorMessage,
      nextEligibleRetryAt: addHours(input.evaluatedAt, 6),
      inventory: input.inventory,
    };
  }

  if (marketNotYetSettled) {
    return {
      marketTicker: input.inventory.marketTicker,
      seriesTicker: input.inventory.seriesTicker,
      classification: "market-not-yet-settled",
      settledOutcome: "unknown",
      settlementTime: null,
      sourceArtifact: importState.importResultPath,
      retrievedAt: importState.retrievedAt,
      conflictReason: null,
      exclusionReason: "market close time is after evaluation time",
      nextEligibleRetryAt: closeTime,
      inventory: input.inventory,
    };
  }

  if (!closeTime && !importState.metadataPresent) {
    return {
      marketTicker: input.inventory.marketTicker,
      seriesTicker: input.inventory.seriesTicker,
      classification: "missing-market-metadata",
      settledOutcome: "unknown",
      settlementTime: null,
      sourceArtifact: importState.importResultPath,
      retrievedAt: importState.retrievedAt,
      conflictReason: null,
      exclusionReason: "missing market close metadata",
      nextEligibleRetryAt: addHours(input.evaluatedAt, 6),
      inventory: input.inventory,
    };
  }

  if (!importState.importResultPath) {
    return {
      marketTicker: input.inventory.marketTicker,
      seriesTicker: input.inventory.seriesTicker,
      classification: "missing-settlement-source",
      settledOutcome: "unknown",
      settlementTime: null,
      sourceArtifact: null,
      retrievedAt: null,
      conflictReason: null,
      exclusionReason: "import-result.json missing",
      nextEligibleRetryAt: null,
      inventory: input.inventory,
    };
  }

  const conflictReason = detectSettlementConflicts(importState.candidates);
  if (conflictReason) {
    const preferred = choosePreferredSettlementCandidate(importState.candidates);
    return {
      marketTicker: input.inventory.marketTicker,
      seriesTicker: input.inventory.seriesTicker,
      classification: "settlement-present-but-conflicting",
      settledOutcome: preferred?.settledOutcome ?? "unknown",
      settlementTime: preferred?.settlementTime ?? null,
      sourceArtifact: preferred?.sourceArtifact ?? importState.importResultPath,
      retrievedAt: preferred?.retrievedAt ?? importState.retrievedAt,
      conflictReason,
      exclusionReason: conflictReason,
      nextEligibleRetryAt: null,
      inventory: input.inventory,
    };
  }

  const preferred = choosePreferredSettlementCandidate(importState.candidates);
  if (!preferred) {
    return {
      marketTicker: input.inventory.marketTicker,
      seriesTicker: input.inventory.seriesTicker,
      classification: "missing-settlement-source",
      settledOutcome: "unknown",
      settlementTime: null,
      sourceArtifact: importState.importResultPath,
      retrievedAt: importState.retrievedAt,
      conflictReason: null,
      exclusionReason: "no settlement outcome in import-result.json",
      nextEligibleRetryAt: addHours(input.evaluatedAt, 6),
      inventory: input.inventory,
    };
  }

  const stale =
    input.staleAfterCaptureObservation
    && isSettlementStale({
      retrievedAt: preferred.retrievedAt ?? importState.retrievedAt,
      lastObservedAt: input.inventory.lastObservedAt,
      marketCloseTime: closeTime,
      evaluatedAt: input.evaluatedAt,
    });

  if (stale) {
    return {
      marketTicker: input.inventory.marketTicker,
      seriesTicker: input.inventory.seriesTicker,
      classification: "settlement-present-but-stale",
      settledOutcome: preferred.settledOutcome,
      settlementTime: preferred.settlementTime,
      sourceArtifact: preferred.sourceArtifact,
      retrievedAt: preferred.retrievedAt ?? importState.retrievedAt,
      conflictReason: null,
      exclusionReason: "settlement import predates capture observations",
      nextEligibleRetryAt: null,
      inventory: input.inventory,
    };
  }

  return {
    marketTicker: input.inventory.marketTicker,
    seriesTicker: input.inventory.seriesTicker,
    classification: "settlement-ready",
    settledOutcome: preferred.settledOutcome,
    settlementTime: preferred.settlementTime,
    sourceArtifact: preferred.sourceArtifact,
    retrievedAt: preferred.retrievedAt ?? importState.retrievedAt,
    conflictReason: null,
    exclusionReason: null,
    nextEligibleRetryAt: null,
    inventory: input.inventory,
  };
}

export function classifyInvalidMarketEntry(input: {
  marketTicker: string;
  reason: string;
}): MarketSettlementCoverageEntry {
  return {
    marketTicker: input.marketTicker,
    seriesTicker: "unknown",
    classification: "invalid-market",
    settledOutcome: "unknown",
    settlementTime: null,
    sourceArtifact: null,
    retrievedAt: null,
    conflictReason: null,
    exclusionReason: input.reason,
    nextEligibleRetryAt: null,
    inventory: {
      marketTicker: input.marketTicker,
      seriesTicker: "unknown",
      firstObservedAt: "",
      lastObservedAt: "",
      observationCount: 0,
      marketCloseTime: null,
      expectedSettlementAvailability: "unknown",
      eventTicker: null,
      sourceArtifacts: [],
    },
  };
}

export function isBackfillCandidate(
  classification: SettlementCoverageClassification,
): boolean {
  return (
    classification === "missing-settlement-source"
    || classification === "settlement-present-but-stale"
    || classification === "import-failed"
  );
}

export function countByClassification(
  markets: readonly MarketSettlementCoverageEntry[],
  classification: SettlementCoverageClassification,
): number {
  return markets.filter((market) => market.classification === classification).length;
}
