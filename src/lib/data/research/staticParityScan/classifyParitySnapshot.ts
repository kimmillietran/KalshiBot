import type {
  StaticParityClassification,
  StaticParityFrictionConfig,
} from "./staticParityScanTypes";

export type ParitySnapshotInput = {
  yesBidCents: number | null;
  yesAskCents: number | null;
  noBidCents: number | null;
  noAskCents: number | null;
  yesBestBidSize: number | null;
  yesBestAskSize: number | null;
  noBestBidSize: number | null;
  noBestAskSize: number | null;
  bookState: string;
};

export type ParitySnapshotDiagnostics = {
  yesAskPlusNoAskCents: number | null;
  yesBidPlusNoBidCents: number | null;
  yesBidPlusNoAskCents: number | null;
  noBidPlusYesAskCents: number | null;
  yesSpreadCents: number | null;
  noSpreadCents: number | null;
  grossEdgeCents: number | null;
  estimatedNetEdgeCents: number | null;
  availableSize: number | null;
  classification: StaticParityClassification;
  reason: string;
  isGrossCandidate: boolean;
  isBufferAdjustedCandidate: boolean;
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

function hasRequiredSides(
  input: ParitySnapshotInput,
  requireBothSidesPresent: boolean,
): boolean {
  if (!requireBothSidesPresent) {
    return true;
  }

  return (
    isValidPrice(input.yesBidCents)
    && isValidPrice(input.yesAskCents)
    && isValidPrice(input.noBidCents)
    && isValidPrice(input.noAskCents)
  );
}

function hasSufficientDepth(
  input: ParitySnapshotInput,
  minSizeContracts: number,
): boolean {
  const sizes = [
    input.yesBestBidSize,
    input.yesBestAskSize,
    input.noBestBidSize,
    input.noBestAskSize,
  ].filter((value): value is number => value !== null && value >= minSizeContracts);

  return sizes.length > 0;
}

function isLockedOrCrossed(bid: number | null, ask: number | null): boolean {
  if (!isValidPrice(bid) || !isValidPrice(ask)) {
    return false;
  }

  return bid >= ask;
}

export function classifyParitySnapshot(
  input: ParitySnapshotInput,
  friction: StaticParityFrictionConfig,
): ParitySnapshotDiagnostics {
  const yesAskPlusNoAskCents =
    isValidPrice(input.yesAskCents) && isValidPrice(input.noAskCents)
      ? input.yesAskCents + input.noAskCents
      : null;
  const yesBidPlusNoBidCents =
    isValidPrice(input.yesBidCents) && isValidPrice(input.noBidCents)
      ? input.yesBidCents + input.noBidCents
      : null;
  const yesBidPlusNoAskCents =
    isValidPrice(input.yesBidCents) && isValidPrice(input.noAskCents)
      ? input.yesBidCents + input.noAskCents
      : null;
  const noBidPlusYesAskCents =
    isValidPrice(input.noBidCents) && isValidPrice(input.yesAskCents)
      ? input.noBidCents + input.yesAskCents
      : null;
  const yesSpreadCents =
    isValidPrice(input.yesBidCents) && isValidPrice(input.yesAskCents)
      ? input.yesAskCents - input.yesBidCents
      : null;
  const noSpreadCents =
    isValidPrice(input.noBidCents) && isValidPrice(input.noAskCents)
      ? input.noAskCents - input.noBidCents
      : null;

  if (input.bookState !== "valid") {
    return {
      yesAskPlusNoAskCents,
      yesBidPlusNoBidCents,
      yesBidPlusNoAskCents,
      noBidPlusYesAskCents,
      yesSpreadCents,
      noSpreadCents,
      grossEdgeCents: null,
      estimatedNetEdgeCents: null,
      availableSize: null,
      classification: "invalid-book-state",
      reason: `Book state is ${input.bookState}.`,
      isGrossCandidate: false,
      isBufferAdjustedCandidate: false,
    };
  }

  const prices = [
    input.yesBidCents,
    input.yesAskCents,
    input.noBidCents,
    input.noAskCents,
  ];
  if (prices.some((price) => price !== null && !isValidPrice(price))) {
    return {
      yesAskPlusNoAskCents,
      yesBidPlusNoBidCents,
      yesBidPlusNoAskCents,
      noBidPlusYesAskCents,
      yesSpreadCents,
      noSpreadCents,
      grossEdgeCents: null,
      estimatedNetEdgeCents: null,
      availableSize: null,
      classification: "invalid-book-state",
      reason: "Impossible price outside 0-100 cents.",
      isGrossCandidate: false,
      isBufferAdjustedCandidate: false,
    };
  }

  if (
    isLockedOrCrossed(input.yesBidCents, input.yesAskCents)
    || isLockedOrCrossed(input.noBidCents, input.noAskCents)
  ) {
    return {
      yesAskPlusNoAskCents,
      yesBidPlusNoBidCents,
      yesBidPlusNoAskCents,
      noBidPlusYesAskCents,
      yesSpreadCents,
      noSpreadCents,
      grossEdgeCents: null,
      estimatedNetEdgeCents: null,
      availableSize: null,
      classification: "invalid-book-state",
      reason: "YES or NO book is locked/crossed.",
      isGrossCandidate: false,
      isBufferAdjustedCandidate: false,
    };
  }

  if (!hasRequiredSides(input, friction.requireBothSidesPresent)) {
    return {
      yesAskPlusNoAskCents,
      yesBidPlusNoBidCents,
      yesBidPlusNoAskCents,
      noBidPlusYesAskCents,
      yesSpreadCents,
      noSpreadCents,
      grossEdgeCents: null,
      estimatedNetEdgeCents: null,
      availableSize: null,
      classification: "insufficient-book-depth",
      reason: "Missing YES or NO side quote.",
      isGrossCandidate: false,
      isBufferAdjustedCandidate: false,
    };
  }

  if (!hasSufficientDepth(input, friction.minSizeContracts)) {
    return {
      yesAskPlusNoAskCents,
      yesBidPlusNoBidCents,
      yesBidPlusNoAskCents,
      noBidPlusYesAskCents,
      yesSpreadCents,
      noSpreadCents,
      grossEdgeCents: null,
      estimatedNetEdgeCents: null,
      availableSize: minNullable(
        input.yesBestAskSize,
        input.noBestAskSize,
        input.yesBestBidSize,
        input.noBestBidSize,
      ),
      classification: "insufficient-book-depth",
      reason: `Available size below ${friction.minSizeContracts} contracts.`,
      isGrossCandidate: false,
      isBufferAdjustedCandidate: false,
    };
  }

  let grossEdgeCents: number | null = null;
  let reason = "No gross parity violation observed.";

  if (yesAskPlusNoAskCents !== null && yesAskPlusNoAskCents < 100) {
    grossEdgeCents = 100 - yesAskPlusNoAskCents;
    reason = `YES ask + NO ask < 100 (${yesAskPlusNoAskCents}¢).`;
  } else if (yesBidPlusNoBidCents !== null && yesBidPlusNoBidCents > 100) {
    grossEdgeCents = yesBidPlusNoBidCents - 100;
    reason = `YES bid + NO bid > 100 (${yesBidPlusNoBidCents}¢).`;
  }

  const estimatedNetEdgeCents =
    grossEdgeCents === null ? null : grossEdgeCents - friction.feeBufferCents;
  const availableSize = minNullable(
    input.yesBestAskSize,
    input.noBestAskSize,
    input.yesBestBidSize,
    input.noBestBidSize,
  );

  if (grossEdgeCents === null || grossEdgeCents <= 0) {
    return {
      yesAskPlusNoAskCents,
      yesBidPlusNoBidCents,
      yesBidPlusNoAskCents,
      noBidPlusYesAskCents,
      yesSpreadCents,
      noSpreadCents,
      grossEdgeCents,
      estimatedNetEdgeCents,
      availableSize,
      classification: "no-signal",
      reason,
      isGrossCandidate: false,
      isBufferAdjustedCandidate: false,
    };
  }

  const isGrossCandidate = grossEdgeCents >= friction.minGrossEdgeCents;
  const isBufferAdjustedCandidate =
    estimatedNetEdgeCents !== null && estimatedNetEdgeCents >= friction.minGrossEdgeCents;

  if (isBufferAdjustedCandidate) {
    return {
      yesAskPlusNoAskCents,
      yesBidPlusNoBidCents,
      yesBidPlusNoAskCents,
      noBidPlusYesAskCents,
      yesSpreadCents,
      noSpreadCents,
      grossEdgeCents,
      estimatedNetEdgeCents,
      availableSize,
      classification: "buffer-adjusted-candidate",
      reason: `${reason} Net edge after ${friction.feeBufferCents}¢ buffer: ${estimatedNetEdgeCents}¢.`,
      isGrossCandidate,
      isBufferAdjustedCandidate,
    };
  }

  if (isGrossCandidate) {
    return {
      yesAskPlusNoAskCents,
      yesBidPlusNoBidCents,
      yesBidPlusNoAskCents,
      noBidPlusYesAskCents,
      yesSpreadCents,
      noSpreadCents,
      grossEdgeCents,
      estimatedNetEdgeCents,
      availableSize,
      classification: "gross-parity-candidate",
      reason: `${reason} Gross edge below buffer-adjusted threshold.`,
      isGrossCandidate,
      isBufferAdjustedCandidate,
    };
  }

  return {
    yesAskPlusNoAskCents,
    yesBidPlusNoBidCents,
    yesBidPlusNoAskCents,
    noBidPlusYesAskCents,
    yesSpreadCents,
    noSpreadCents,
    grossEdgeCents,
    estimatedNetEdgeCents,
    availableSize,
    classification: "parity-watch",
    reason: `${reason} Edge below minimum gross threshold.`,
    isGrossCandidate,
    isBufferAdjustedCandidate,
  };
}
