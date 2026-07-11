import { classifyBidOnlyParitySnapshot } from "../staticParityScan/classifyBidOnlyParitySnapshot";
import type { StaticParityFrictionConfig } from "../staticParityScan/staticParityScanTypes";
import { resolveTopOfBookEconomicFields } from "@/lib/data/live/forwardQuoteCapture/classifyTopOfBookEconomicValidity";

import type {
  ParityNearMissObservationMetrics,
  ParityNearMissRejectionGate,
  ParityNearMissRuleConfiguration,
} from "./parityNearMissAnalysisTypes";

export type ParityObservationInput = {
  marketTicker: string;
  receivedAtLocal: string;
  receivedAtMs: number;
  bookState: string;
  yesBestBidCents: number | null;
  noBestBidCents: number | null;
  yesBestBidSize: number | null;
  noBestBidSize: number | null;
  yesBestAskCents?: number | null;
  noBestAskCents?: number | null;
  exchangeTimestampMs?: number | null;
  btcSpotPriceUsd?: number | null;
  closeTimeMs?: number | null;
  sequence?: number | null;
  priorSequence?: number | null;
  isParityUsable?: boolean;
  economicBookState?: string;
};

function createEmptyGateRecord(): Record<ParityNearMissRejectionGate, number> {
  return {
    "invalid-book": 0,
    "unsynchronized-book": 0,
    "missing-btc-join": 0,
    "missing-executable-size": 0,
    "no-positive-edge": 0,
    "gross-parity-shortfall": 0,
    "buffer-adjusted-shortfall": 0,
    "stale-quote": 0,
    "market-not-open": 0,
    "insufficient-persistence": 0,
  };
}

export function createEmptyGateCounts() {
  return {
    firstRejectionByGate: createEmptyGateRecord(),
    allRejectionsByGate: createEmptyGateRecord(),
    recordsReachingStage: {
      loaded: 0,
      eligible: 0,
      validBook: 0,
      synchronizedBook: 0,
      sizedBidPair: 0,
      positiveEdge: 0,
      grossPass: 0,
      feePass: 0,
      bufferPass: 0,
      stalenessPass: 0,
    },
    episodesReachingStage: {
      built: 0,
      grossEpisode: 0,
      bufferEpisode: 0,
      persistentEpisode: 0,
    },
  };
}

function shortfallDistance(threshold: number, value: number | null): number | null {
  if (value === null) {
    return null;
  }
  return threshold - value;
}

function resolveIntegrityCaveat(input: {
  priorSequence: number | null | undefined;
  sequence: number | null | undefined;
  bookSynchronized: boolean;
  bookValid: boolean;
}): string | null {
  const caveats: string[] = [];
  if (
    input.priorSequence !== null
    && input.priorSequence !== undefined
    && input.sequence !== null
    && input.sequence !== undefined
    && input.sequence > input.priorSequence + 1
  ) {
    caveats.push("near-sequence-discontinuity");
  }
  if (!input.bookSynchronized) {
    caveats.push("unsynchronized-book");
  }
  if (!input.bookValid) {
    caveats.push("invalid-book-window");
  }
  return caveats.length > 0 ? caveats.join(";") : null;
}

/** Evaluates one top-of-book observation against frozen bid-only parity gates. */
export function evaluateParityObservationGates(
  input: ParityObservationInput,
  rule: ParityNearMissRuleConfiguration,
): ParityNearMissObservationMetrics {
  const economic = resolveTopOfBookEconomicFields({
    bookState: input.bookState,
    yesBestBidCents: input.yesBestBidCents,
    yesBestAskCents: input.yesBestAskCents ?? null,
    noBestBidCents: input.noBestBidCents,
    noBestAskCents: input.noBestAskCents ?? null,
    yesBestBidSize: input.yesBestBidSize,
    noBestBidSize: input.noBestBidSize,
    economicBookState: input.economicBookState,
    isParityUsable: input.isParityUsable,
  });

  const hasAskLadder =
    input.yesBestAskCents !== null
    && input.yesBestAskCents !== undefined
    && input.noBestAskCents !== null
    && input.noBestAskCents !== undefined;

  const bookValid = input.bookState === "valid";
  const bookSynchronized =
    bookValid
    && (
      !hasAskLadder
      || (
        !economic.yesBookCrossed
        && !economic.noBookCrossed
        && economic.economicBookState !== "sequence-valid-crossed"
        && economic.economicBookState !== "sequence-valid-locked"
      )
    );

  const quoteAgeMs =
    input.exchangeTimestampMs !== null && input.exchangeTimestampMs !== undefined
      ? Math.max(0, input.receivedAtMs - input.exchangeTimestampMs)
      : null;
  const stalenessPass =
    quoteAgeMs === null ? null : quoteAgeMs <= rule.stalenessBoundMs;

  const timeRemainingMs =
    input.closeTimeMs !== null && input.closeTimeMs !== undefined
      ? input.closeTimeMs - input.receivedAtMs
      : null;

  const btcJoinAvailable = input.btcSpotPriceUsd !== null && input.btcSpotPriceUsd !== undefined;

  const friction: StaticParityFrictionConfig = rule;
  const diagnostics = classifyBidOnlyParitySnapshot(
    {
      yesBidCents: input.yesBestBidCents,
      noBidCents: input.noBestBidCents,
      yesBestBidSize: input.yesBestBidSize,
      noBestBidSize: input.noBestBidSize,
      bookState: input.bookState,
    },
    friction,
  );

  const executableSize = diagnostics.minBidSizeContracts;
  const sizePass =
    executableSize !== null && executableSize >= rule.minSizeContracts;
  const grossParityPass = diagnostics.isGrossCandidate;
  const bufferPass = diagnostics.isBufferAdjustedCandidate;
  const feePass =
    diagnostics.estimatedNetEdgeCents !== null
    && diagnostics.estimatedNetEdgeCents > 0;

  const grossDistanceToQualification = shortfallDistance(
    rule.minGrossEdgeCents,
    diagnostics.bidOnlyEdgeCents,
  );
  const feeAdjustedDistanceToQualification = shortfallDistance(
    rule.feeBufferCents + 1,
    diagnostics.bidOnlyEdgeCents,
  );
  const bufferAdjustedDistanceToQualification = shortfallDistance(
    rule.minBidOnlyEdgeCents,
    diagnostics.estimatedNetEdgeCents,
  );

  const parityRejectingGates: ParityNearMissRejectionGate[] = [];
  if (input.bookState !== "valid") {
    parityRejectingGates.push("invalid-book");
  }
  if (!bookSynchronized) {
    parityRejectingGates.push("unsynchronized-book");
  }
  if (!sizePass) {
    parityRejectingGates.push("missing-executable-size");
  }
  if (diagnostics.bidOnlyEdgeCents === null || diagnostics.bidOnlyEdgeCents <= 0) {
    parityRejectingGates.push("no-positive-edge");
  } else if (!grossParityPass) {
    parityRejectingGates.push("gross-parity-shortfall");
  }
  if (grossParityPass && !bufferPass) {
    parityRejectingGates.push("buffer-adjusted-shortfall");
  }
  if (stalenessPass === false) {
    parityRejectingGates.push("stale-quote");
  }

  const annotationGates: ParityNearMissRejectionGate[] = [];
  if (!btcJoinAvailable) {
    annotationGates.push("missing-btc-join");
  }

  const allRejectingGates = [...parityRejectingGates, ...annotationGates];
  const firstRejectingGate = parityRejectingGates[0] ?? null;
  const metricUnavailableReasons: Record<string, string> = {};
  if (quoteAgeMs === null) {
    metricUnavailableReasons.quoteAgeMs = "exchangeTimestampMs missing";
  }
  metricUnavailableReasons.marketOpen = "market-open status not captured in forward quotes";

  return {
    marketTicker: input.marketTicker,
    timestamp: input.receivedAtLocal,
    receivedAtMs: input.receivedAtMs,
    timeRemainingMs,
    yesBidCents: input.yesBestBidCents,
    noBidCents: input.noBestBidCents,
    yesBidSize: input.yesBestBidSize,
    noBidSize: input.noBestBidSize,
    bidOnlyParityValue: diagnostics.bidOnlyEdgeCents,
    grossDistanceToQualification,
    feeAdjustedDistanceToQualification,
    bufferAdjustedDistanceToQualification,
    executableSize,
    bookValid,
    bookSynchronized,
    marketOpen: null,
    btcJoinAvailable,
    quoteAgeMs,
    stalenessPass,
    sizePass,
    grossParityPass,
    feePass,
    bufferPass,
    persistencePass: null,
    firstRejectingGate,
    allRejectingGates,
    integrityCaveat: resolveIntegrityCaveat({
      priorSequence: input.priorSequence,
      sequence: input.sequence,
      bookSynchronized,
      bookValid,
    }),
    metricUnavailableReasons,
  };
}

export function isObservationEligible(metrics: ParityNearMissObservationMetrics): boolean {
  return metrics.bookValid;
}

export function resolveDistanceBucket(
  distance: number | null,
): import("./parityNearMissAnalysisTypes").ParityNearMissDistanceBucket {
  if (distance === null) {
    return "no-edge";
  }
  if (distance <= 0) {
    return "qualified";
  }
  if (distance <= 0.5) {
    return "within-0.5-cents";
  }
  if (distance <= 1) {
    return "0.5-to-1-cent";
  }
  if (distance <= 2) {
    return "1-to-2-cents";
  }
  if (distance <= 5) {
    return "2-to-5-cents";
  }
  if (distance <= 10) {
    return "5-to-10-cents";
  }
  return "more-than-10-cents";
}

export function incrementGateCounts(
  counts: ReturnType<typeof createEmptyGateCounts>,
  metrics: ParityNearMissObservationMetrics,
): void {
  counts.recordsReachingStage.loaded += 1;
  if (!isObservationEligible(metrics)) {
    if (metrics.firstRejectingGate) {
      counts.firstRejectionByGate[metrics.firstRejectingGate] += 1;
    }
    for (const gate of metrics.allRejectingGates) {
      counts.allRejectionsByGate[gate] += 1;
    }
    return;
  }

  counts.recordsReachingStage.eligible += 1;
  if (metrics.bookValid) {
    counts.recordsReachingStage.validBook += 1;
  }
  if (metrics.bookSynchronized) {
    counts.recordsReachingStage.synchronizedBook += 1;
  }
  if (metrics.sizePass) {
    counts.recordsReachingStage.sizedBidPair += 1;
  }
  if (metrics.bidOnlyParityValue !== null && metrics.bidOnlyParityValue > 0) {
    counts.recordsReachingStage.positiveEdge += 1;
  }
  if (metrics.grossParityPass) {
    counts.recordsReachingStage.grossPass += 1;
  }
  if (metrics.feePass) {
    counts.recordsReachingStage.feePass += 1;
  }
  if (metrics.bufferPass) {
    counts.recordsReachingStage.bufferPass += 1;
  }
  if (metrics.stalenessPass !== false) {
    counts.recordsReachingStage.stalenessPass += 1;
  }

  if (metrics.firstRejectingGate) {
    counts.firstRejectionByGate[metrics.firstRejectingGate] += 1;
  }
  for (const gate of metrics.allRejectingGates) {
    counts.allRejectionsByGate[gate] += 1;
  }
}

export function buildRuleConfiguration(
  config: import("./parityNearMissAnalysisTypes").ParityNearMissAnalysisConfig,
): ParityNearMissRuleConfiguration {
  return {
    ...config.friction,
    stalenessBoundMs: config.stalenessBoundMs,
    lifecycle: config.lifecycle,
  };
}
