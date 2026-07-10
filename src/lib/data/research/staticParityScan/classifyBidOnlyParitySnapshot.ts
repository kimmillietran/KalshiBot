import type { StaticParityFrictionConfig } from "./staticParityScanTypes";

export const BID_ONLY_PARITY_CLASSIFICATIONS = [
  "bid-only-no-signal",
  "bid-only-watch",
  "bid-only-gross-candidate",
  "bid-only-buffer-adjusted-candidate",
  "bid-only-insufficient-depth",
  "bid-only-invalid-price",
] as const;

export type BidOnlyParityClassification =
  (typeof BID_ONLY_PARITY_CLASSIFICATIONS)[number];

export type BidOnlyParitySnapshotInput = {
  yesBidCents: number | null;
  noBidCents: number | null;
  yesBestBidSize: number | null;
  noBestBidSize: number | null;
  bookState: string;
};

export type BidOnlyParitySnapshotDiagnostics = {
  bidSumCents: number | null;
  bidOnlyEdgeCents: number | null;
  estimatedNetEdgeCents: number | null;
  minBidSizeContracts: number | null;
  classification: BidOnlyParityClassification;
  reason: string;
  isGrossCandidate: boolean;
  isBufferAdjustedCandidate: boolean;
  requiresExecutableConfirmation: boolean;
};

function isValidPrice(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 100;
}

function minNullable(...values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }

  let min = present[0]!;
  for (const value of present.slice(1)) {
    if (value < min) {
      min = value;
    }
  }

  return min;
}

export function classifyBidOnlyParitySnapshot(
  input: BidOnlyParitySnapshotInput,
  friction: StaticParityFrictionConfig,
): BidOnlyParitySnapshotDiagnostics {
  const requiresExecutableConfirmation = friction.requireExecutableConfirmation;

  if (input.bookState !== "valid") {
    return {
      bidSumCents: null,
      bidOnlyEdgeCents: null,
      estimatedNetEdgeCents: null,
      minBidSizeContracts: null,
      classification: "bid-only-invalid-price",
      reason: `Book state is ${input.bookState}.`,
      isGrossCandidate: false,
      isBufferAdjustedCandidate: false,
      requiresExecutableConfirmation,
    };
  }

  if (input.yesBidCents === null) {
    return {
      bidSumCents: null,
      bidOnlyEdgeCents: null,
      estimatedNetEdgeCents: null,
      minBidSizeContracts: null,
      classification: "bid-only-insufficient-depth",
      reason: "Missing YES bid.",
      isGrossCandidate: false,
      isBufferAdjustedCandidate: false,
      requiresExecutableConfirmation,
    };
  }

  if (input.noBidCents === null) {
    return {
      bidSumCents: null,
      bidOnlyEdgeCents: null,
      estimatedNetEdgeCents: null,
      minBidSizeContracts: null,
      classification: "bid-only-insufficient-depth",
      reason: "Missing NO bid.",
      isGrossCandidate: false,
      isBufferAdjustedCandidate: false,
      requiresExecutableConfirmation,
    };
  }

  if (!isValidPrice(input.yesBidCents) || !isValidPrice(input.noBidCents)) {
    return {
      bidSumCents: null,
      bidOnlyEdgeCents: null,
      estimatedNetEdgeCents: null,
      minBidSizeContracts: minNullable(input.yesBestBidSize, input.noBestBidSize),
      classification: "bid-only-invalid-price",
      reason: "Impossible bid price outside 0-100 cents.",
      isGrossCandidate: false,
      isBufferAdjustedCandidate: false,
      requiresExecutableConfirmation,
    };
  }

  const minBidSizeContracts = minNullable(input.yesBestBidSize, input.noBestBidSize);
  if (
    minBidSizeContracts === null
    || minBidSizeContracts < friction.minSizeContracts
  ) {
    return {
      bidSumCents: input.yesBidCents + input.noBidCents,
      bidOnlyEdgeCents: null,
      estimatedNetEdgeCents: null,
      minBidSizeContracts,
      classification: "bid-only-insufficient-depth",
      reason: `Minimum bid size below ${friction.minSizeContracts} contracts.`,
      isGrossCandidate: false,
      isBufferAdjustedCandidate: false,
      requiresExecutableConfirmation,
    };
  }

  const bidSumCents = input.yesBidCents + input.noBidCents;
  const bidOnlyEdgeCents = bidSumCents > 100 ? bidSumCents - 100 : null;
  const estimatedNetEdgeCents =
    bidOnlyEdgeCents === null ? null : bidOnlyEdgeCents - friction.feeBufferCents;

  if (bidOnlyEdgeCents === null || bidOnlyEdgeCents <= 0) {
    return {
      bidSumCents,
      bidOnlyEdgeCents,
      estimatedNetEdgeCents,
      minBidSizeContracts,
      classification: "bid-only-no-signal",
      reason: `YES bid + NO bid <= 100 (${bidSumCents}¢).`,
      isGrossCandidate: false,
      isBufferAdjustedCandidate: false,
      requiresExecutableConfirmation,
    };
  }

  const isGrossCandidate = bidOnlyEdgeCents >= friction.minGrossEdgeCents;
  const isBufferAdjustedCandidate =
    estimatedNetEdgeCents !== null
    && estimatedNetEdgeCents >= friction.minBidOnlyEdgeCents;

  if (isBufferAdjustedCandidate) {
    return {
      bidSumCents,
      bidOnlyEdgeCents,
      estimatedNetEdgeCents,
      minBidSizeContracts,
      classification: "bid-only-buffer-adjusted-candidate",
      reason: `YES bid + NO bid > 100 (${bidSumCents}¢). Net edge after ${friction.feeBufferCents}¢ buffer: ${estimatedNetEdgeCents}¢. Executable confirmation required before any action.`,
      isGrossCandidate,
      isBufferAdjustedCandidate,
      requiresExecutableConfirmation,
    };
  }

  if (isGrossCandidate) {
    return {
      bidSumCents,
      bidOnlyEdgeCents,
      estimatedNetEdgeCents,
      minBidSizeContracts,
      classification: "bid-only-gross-candidate",
      reason: `YES bid + NO bid > 100 (${bidSumCents}¢). Gross bid-book imbalance; not executable without confirmation.`,
      isGrossCandidate,
      isBufferAdjustedCandidate,
      requiresExecutableConfirmation,
    };
  }

  return {
    bidSumCents,
    bidOnlyEdgeCents,
    estimatedNetEdgeCents,
    minBidSizeContracts,
    classification: "bid-only-watch",
    reason: `YES bid + NO bid > 100 (${bidSumCents}¢) but edge below gross threshold.`,
    isGrossCandidate,
    isBufferAdjustedCandidate,
    requiresExecutableConfirmation,
  };
}
