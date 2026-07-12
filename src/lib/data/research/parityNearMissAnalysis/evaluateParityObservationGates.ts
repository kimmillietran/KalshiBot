import { classifyBidOnlyParitySnapshot } from "../staticParityScan/classifyBidOnlyParitySnapshot";
import type { StaticParityFrictionConfig } from "../staticParityScan/staticParityScanTypes";
import {
  resolveTopOfBookEconomicFields,
  type EconomicBookState,
} from "@/lib/data/live/forwardQuoteCapture/classifyTopOfBookEconomicValidity";

import { computeParityShortfalls, isDistanceEvaluable } from "./computeParityShortfalls";
import {
  resolveAllRejectingGates,
  resolveSequentialFirstRejectingGate,
  type ObservationGateFlags,
} from "./parityGateSemantics";
import type {
  ParityNearMissObservationMetrics,
  ParityNearMissRejectionGate,
  ParityNearMissRuleConfiguration,
} from "./parityNearMissAnalysisTypes";
import { evaluateQuoteStaleness } from "./resolveQuoteStaleness";

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
    episodesReachingStage: {
      built: 0,
      grossEpisode: 0,
      bufferEpisode: 0,
      persistentEpisode: 0,
    },
  };
}

export function incrementGateRejectionCounts(
  counts: ReturnType<typeof createEmptyGateCounts>,
  metrics: ParityNearMissObservationMetrics,
): void {
  if (metrics.firstRejectingGate) {
    counts.firstRejectionByGate[metrics.firstRejectingGate] += 1;
  }
  for (const gate of metrics.allRejectingGates) {
    counts.allRejectionsByGate[gate] += 1;
  }
}

const ECONOMIC_BOOK_STATES = new Set<EconomicBookState>([
  "economically-valid",
  "sequence-valid-crossed",
  "sequence-valid-locked",
  "insufficient-depth",
  "awaiting-snapshot",
  "invalid-price",
]);

function readEconomicBookState(value: string | undefined): EconomicBookState | undefined {
  if (value === undefined) {
    return undefined;
  }
  return ECONOMIC_BOOK_STATES.has(value as EconomicBookState)
    ? (value as EconomicBookState)
    : undefined;
}

function resolveIntegrityCaveat(input: {
  priorSequence: number | null | undefined;
  sequence: number | null | undefined;
  bookSynchronized: boolean;
  bookValid: boolean;
  quoteAgeStatus: string;
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
  if (input.quoteAgeStatus === "unknown") {
    caveats.push("unknown-quote-age");
  }
  if (input.quoteAgeStatus === "negative") {
    caveats.push("negative-quote-age");
  }
  return caveats.length > 0 ? caveats.join(";") : null;
}

export function buildObservationGateFlags(input: {
  bookValid: boolean;
  bookSynchronized: boolean;
  bothSidesPresent: boolean;
  stalenessPass: boolean | null;
  sizePass: boolean;
  observedGrossEdgeCents: number | null;
  estimatedNetEdgeCents: number | null;
  friction: StaticParityFrictionConfig;
}): ObservationGateFlags {
  const grossParityPass =
    input.observedGrossEdgeCents !== null
    && input.observedGrossEdgeCents >= input.friction.minGrossEdgeCents;
  const feePass =
    input.estimatedNetEdgeCents !== null && input.estimatedNetEdgeCents > 0;
  const bufferPass =
    input.estimatedNetEdgeCents !== null
    && input.estimatedNetEdgeCents >= input.friction.minBidOnlyEdgeCents;

  return {
    bookValid: input.bookValid,
    bookSynchronized: input.bookSynchronized,
    bothSidesPresent: input.bothSidesPresent,
    stalenessPass: input.stalenessPass,
    sizePass: input.sizePass,
    grossParityPass,
    feePass,
    bufferPass,
  };
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
    economicBookState: readEconomicBookState(input.economicBookState),
    isParityUsable: input.isParityUsable,
  });

  const hasAskLadder =
    input.yesBestAskCents !== null
    && input.yesBestAskCents !== undefined
    && input.noBestAskCents !== null
    && input.noBestAskCents !== undefined;

  const bookValid =
    input.bookState === "valid"
    && economic.economicBookState !== "invalid-price";
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

  const staleness = evaluateQuoteStaleness({
    receivedAtMs: input.receivedAtMs,
    exchangeTimestampMs: input.exchangeTimestampMs,
    stalenessBoundMs: rule.stalenessBoundMs,
  });

  const timeRemainingMs =
    input.closeTimeMs !== null && input.closeTimeMs !== undefined
      ? input.closeTimeMs - input.receivedAtMs
      : null;

  const btcJoinAvailable = input.btcSpotPriceUsd !== null && input.btcSpotPriceUsd !== undefined;
  const bothSidesPresent = isDistanceEvaluable(input.yesBestBidCents, input.noBestBidCents);

  const friction: StaticParityFrictionConfig = rule;
  const shortfalls = computeParityShortfalls(
    input.yesBestBidCents,
    input.noBestBidCents,
    friction,
  );

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

  const gateFlags = buildObservationGateFlags({
    bookValid,
    bookSynchronized,
    bothSidesPresent,
    stalenessPass: staleness.stalenessPass,
    sizePass,
    observedGrossEdgeCents: shortfalls.observedGrossEdgeCents,
    estimatedNetEdgeCents: shortfalls.estimatedNetEdgeCents,
    friction,
  });

  const firstRejectingGate = resolveSequentialFirstRejectingGate(gateFlags);
  const allRejectingGates = resolveAllRejectingGates({
    flags: gateFlags,
  });

  const metricUnavailableReasons: Record<string, string> = {};
  if (staleness.quoteAgeStatus === "unknown") {
    metricUnavailableReasons.quoteAgeMs = "exchangeTimestampMs missing";
  }
  if (!btcJoinAvailable) {
    metricUnavailableReasons.btcSpotPriceUsd = "btc spot join unavailable";
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
    bidOnlyParityValue: shortfalls.observedGrossEdgeCents,
    grossDistanceToQualification: shortfalls.grossDistanceToQualification,
    feeAdjustedDistanceToQualification: shortfalls.feeAdjustedDistanceToQualification,
    bufferAdjustedDistanceToQualification: shortfalls.bufferAdjustedDistanceToQualification,
    executableSize,
    bookValid,
    bookSynchronized,
    marketOpen: null,
    btcJoinAvailable,
    quoteAgeMs: staleness.quoteAgeMs,
    quoteAgeStatus: staleness.quoteAgeStatus,
    stalenessPass: staleness.stalenessPass,
    sizePass,
    grossParityPass: gateFlags.grossParityPass,
    feePass: gateFlags.feePass,
    bufferPass: gateFlags.bufferPass,
    persistencePass: null,
    firstRejectingGate,
    allRejectingGates,
    integrityCaveat: resolveIntegrityCaveat({
      priorSequence: input.priorSequence,
      sequence: input.sequence,
      bookSynchronized,
      bookValid,
      quoteAgeStatus: staleness.quoteAgeStatus,
    }),
    metricUnavailableReasons,
  };
}

export function isObservationEligible(metrics: ParityNearMissObservationMetrics): boolean {
  return metrics.bookValid;
}

export function resolveDistanceBucket(
  distance: number | null,
  evaluable: boolean,
): import("./parityNearMissAnalysisTypes").ParityNearMissDistanceBucket {
  if (!evaluable || distance === null) {
    return "unavailable";
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

export function buildRuleConfiguration(
  config: import("./parityNearMissAnalysisTypes").ParityNearMissAnalysisConfig,
): ParityNearMissRuleConfiguration {
  return {
    ...config.friction,
    stalenessBoundMs: config.stalenessBoundMs,
    lifecycle: config.lifecycle,
  };
}
