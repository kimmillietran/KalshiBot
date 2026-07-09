import { classifyParitySnapshot } from "@/lib/data/research/staticParityScan/classifyParitySnapshot";
import { DEFAULT_STATIC_PARITY_FRICTION_CONFIG } from "@/lib/data/research/staticParityScan/staticParityScanTypes";

export type TopOfBookValidityInput = {
  bookState: string;
  yesBestBidCents: number | null;
  yesBestAskCents: number | null;
  noBestBidCents: number | null;
  noBestAskCents: number | null;
  yesBestBidSize: number | null;
  yesBestAskSize: number | null;
  noBestBidSize: number | null;
  noBestAskSize: number | null;
  yesSpreadCents: number | null;
  noSpreadCents: number | null;
};

export type TopOfBookValidityClass =
  | "capture-invalid"
  | "economically-valid"
  | "parity-usable"
  | "invalid-book-state"
  | "insufficient-depth"
  | "missing-yes-side"
  | "missing-no-side"
  | "missing-yes-bid"
  | "missing-yes-ask"
  | "missing-no-bid"
  | "missing-no-ask"
  | "crossed-yes-book"
  | "crossed-no-book"
  | "locked-yes-book"
  | "locked-no-book"
  | "impossible-price"
  | "out-of-range-price"
  | "zero-or-null-size";

export type TopOfBookValidityResult = {
  captureValid: boolean;
  economicallyValid: boolean;
  parityUsable: boolean;
  primaryClass: TopOfBookValidityClass;
  reason: string;
  missingYesBid: boolean;
  missingYesAsk: boolean;
  missingNoBid: boolean;
  missingNoAsk: boolean;
  missingYesSide: boolean;
  missingNoSide: boolean;
  crossedYes: boolean;
  crossedNo: boolean;
  lockedYes: boolean;
  lockedNo: boolean;
  impossiblePrice: boolean;
  outOfRangePrice: boolean;
  zeroOrNullSize: boolean;
  yesBidGreaterThanYesAsk: boolean;
  yesBidEqualsYesAsk: boolean;
  noBidGreaterThanNoAsk: boolean;
  noBidEqualsNoAsk: boolean;
  yesAskDerivedFromNoBid: boolean;
  noAskDerivedFromYesBid: boolean;
  negativeImpliedSpreadBeforeClamp: boolean;
  spreadClampedToZeroSuspicion: boolean;
};

function isPresentPrice(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function isInRangePrice(value: number): boolean {
  return value >= 0 && value <= 100;
}

function isEffectivelyZeroSize(value: number | null): boolean {
  return value === null || !Number.isFinite(value) || value < 1;
}

function matchesDerivedAsk(
  askCents: number | null,
  oppositeBidCents: number | null,
): boolean {
  if (!isPresentPrice(askCents) || !isPresentPrice(oppositeBidCents)) {
    return false;
  }

  return askCents === Math.max(100 - oppositeBidCents, 0);
}

export function classifyTopOfBookValidity(
  input: TopOfBookValidityInput,
): TopOfBookValidityResult {
  const captureValid = input.bookState === "valid";

  const missingYesBid = !isPresentPrice(input.yesBestBidCents);
  const missingYesAsk = !isPresentPrice(input.yesBestAskCents);
  const missingNoBid = !isPresentPrice(input.noBestBidCents);
  const missingNoAsk = !isPresentPrice(input.noBestAskCents);
  const missingYesSide = missingYesBid && missingYesAsk;
  const missingNoSide = missingNoBid && missingNoAsk;

  const prices = [
    input.yesBestBidCents,
    input.yesBestAskCents,
    input.noBestBidCents,
    input.noBestAskCents,
  ];
  const outOfRangePrice = prices.some(
    (price) => isPresentPrice(price) && !isInRangePrice(price),
  );
  const impossiblePrice = outOfRangePrice;

  const crossedYes =
    isPresentPrice(input.yesBestBidCents)
    && isPresentPrice(input.yesBestAskCents)
    && input.yesBestBidCents > input.yesBestAskCents;
  const crossedNo =
    isPresentPrice(input.noBestBidCents)
    && isPresentPrice(input.noBestAskCents)
    && input.noBestBidCents > input.noBestAskCents;
  const lockedYes =
    isPresentPrice(input.yesBestBidCents)
    && isPresentPrice(input.yesBestAskCents)
    && input.yesBestBidCents === input.yesBestAskCents;
  const lockedNo =
    isPresentPrice(input.noBestBidCents)
    && isPresentPrice(input.noBestAskCents)
    && input.noBestBidCents === input.noBestAskCents;

  const yesBidGreaterThanYesAsk = crossedYes;
  const yesBidEqualsYesAsk = lockedYes;
  const noBidGreaterThanNoAsk = crossedNo;
  const noBidEqualsNoAsk = lockedNo;

  const yesAskDerivedFromNoBid = matchesDerivedAsk(
    input.yesBestAskCents,
    input.noBestBidCents,
  );
  const noAskDerivedFromYesBid = matchesDerivedAsk(
    input.noBestAskCents,
    input.yesBestBidCents,
  );

  const rawYesSpread =
    isPresentPrice(input.yesBestBidCents) && isPresentPrice(input.yesBestAskCents)
      ? input.yesBestAskCents - input.yesBestBidCents
      : null;
  const rawNoSpread =
    isPresentPrice(input.noBestBidCents) && isPresentPrice(input.noBestAskCents)
      ? input.noBestAskCents - input.noBestBidCents
      : null;
  const negativeImpliedSpreadBeforeClamp =
    (rawYesSpread !== null && rawYesSpread < 0)
    || (rawNoSpread !== null && rawNoSpread < 0);
  const spreadClampedToZeroSuspicion =
    negativeImpliedSpreadBeforeClamp
    && (
      (rawYesSpread !== null && input.yesSpreadCents === 0)
      || (rawNoSpread !== null && input.noSpreadCents === 0)
    );

  const zeroOrNullSize =
    isEffectivelyZeroSize(input.yesBestBidSize)
    && isEffectivelyZeroSize(input.yesBestAskSize)
    && isEffectivelyZeroSize(input.noBestBidSize)
    && isEffectivelyZeroSize(input.noBestAskSize);

  const economicallyValid =
    captureValid
    && !missingYesBid
    && !missingYesAsk
    && !missingNoBid
    && !missingNoAsk
    && !outOfRangePrice
    && !crossedYes
    && !crossedNo
    && !lockedYes
    && !lockedNo;

  const parityDiagnostics = classifyParitySnapshot(
    {
      yesBidCents: input.yesBestBidCents,
      yesAskCents: input.yesBestAskCents,
      noBidCents: input.noBestBidCents,
      noAskCents: input.noBestAskCents,
      yesBestBidSize: input.yesBestBidSize,
      yesBestAskSize: input.yesBestAskSize,
      noBestBidSize: input.noBestBidSize,
      noBestAskSize: input.noBestAskSize,
      bookState: input.bookState,
    },
    DEFAULT_STATIC_PARITY_FRICTION_CONFIG,
  );

  const parityUsable =
    parityDiagnostics.classification !== "invalid-book-state"
    && parityDiagnostics.classification !== "insufficient-book-depth";

  let primaryClass: TopOfBookValidityClass;
  let reason: string;

  if (!captureValid) {
    primaryClass = "capture-invalid";
    reason = `Capture bookState is ${input.bookState}.`;
  } else if (missingYesSide) {
    primaryClass = "missing-yes-side";
    reason = "Missing YES bid and ask.";
  } else if (missingNoSide) {
    primaryClass = "missing-no-side";
    reason = "Missing NO bid and ask.";
  } else if (missingYesBid) {
    primaryClass = "missing-yes-bid";
    reason = "Missing YES bid.";
  } else if (missingYesAsk) {
    primaryClass = "missing-yes-ask";
    reason = "Missing YES ask.";
  } else if (missingNoBid) {
    primaryClass = "missing-no-bid";
    reason = "Missing NO bid.";
  } else if (missingNoAsk) {
    primaryClass = "missing-no-ask";
    reason = "Missing NO ask.";
  } else if (outOfRangePrice) {
    primaryClass = impossiblePrice ? "impossible-price" : "out-of-range-price";
    reason = "Price outside 0-100 cents.";
  } else if (crossedYes) {
    primaryClass = "crossed-yes-book";
    reason = `YES book crossed: bid ${input.yesBestBidCents} > ask ${input.yesBestAskCents}.`;
  } else if (crossedNo) {
    primaryClass = "crossed-no-book";
    reason = `NO book crossed: bid ${input.noBestBidCents} > ask ${input.noBestAskCents}.`;
  } else if (lockedYes) {
    primaryClass = "locked-yes-book";
    reason = "YES book locked.";
  } else if (lockedNo) {
    primaryClass = "locked-no-book";
    reason = "NO book locked.";
  } else if (parityDiagnostics.classification === "insufficient-book-depth") {
    primaryClass = "insufficient-depth";
    reason = parityDiagnostics.reason;
  } else if (parityDiagnostics.classification === "invalid-book-state") {
    primaryClass = "invalid-book-state";
    reason = parityDiagnostics.reason;
  } else if (economicallyValid && parityUsable) {
    primaryClass = "parity-usable";
    reason = "Economically consistent and parity-usable.";
  } else if (economicallyValid) {
    primaryClass = "economically-valid";
    reason = "Economically consistent.";
  } else {
    primaryClass = "invalid-book-state";
    reason = "Unclassified invalid state.";
  }

  if (zeroOrNullSize && primaryClass === "parity-usable") {
    primaryClass = "zero-or-null-size";
    reason = "All displayed sizes are zero or null.";
  }

  return {
    captureValid,
    economicallyValid,
    parityUsable,
    primaryClass,
    reason,
    missingYesBid,
    missingYesAsk,
    missingNoBid,
    missingNoAsk,
    missingYesSide,
    missingNoSide,
    crossedYes,
    crossedNo,
    lockedYes,
    lockedNo,
    impossiblePrice,
    outOfRangePrice,
    zeroOrNullSize,
    yesBidGreaterThanYesAsk,
    yesBidEqualsYesAsk,
    noBidGreaterThanNoAsk,
    noBidEqualsNoAsk,
    yesAskDerivedFromNoBid,
    noAskDerivedFromYesBid,
    negativeImpliedSpreadBeforeClamp,
    spreadClampedToZeroSuspicion,
  };
}
