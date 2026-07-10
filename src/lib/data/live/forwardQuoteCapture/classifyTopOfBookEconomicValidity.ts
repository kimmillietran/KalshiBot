import { classifyParitySnapshot } from "@/lib/data/research/staticParityScan/classifyParitySnapshot";
import { DEFAULT_STATIC_PARITY_FRICTION_CONFIG } from "@/lib/data/research/staticParityScan/staticParityScanTypes";

export type EconomicBookState =
  | "economically-valid"
  | "sequence-valid-crossed"
  | "sequence-valid-locked"
  | "insufficient-depth"
  | "awaiting-snapshot"
  | "invalid-price";

export type TopOfBookEconomicValidityInput = {
  bookState: string;
  yesBestBidCents: number | null;
  yesBestAskCents: number | null;
  noBestBidCents: number | null;
  noBestAskCents: number | null;
  yesBestBidSize?: number | null;
  yesBestAskSize?: number | null;
  noBestBidSize?: number | null;
  noBestAskSize?: number | null;
};

export type TopOfBookEconomicValidityResult = {
  economicBookState: EconomicBookState;
  economicInvalidReasons: readonly string[];
  isEconomicallyValid: boolean;
  isParityUsable: boolean;
  yesSignedSpreadCents: number | null;
  noSignedSpreadCents: number | null;
  yesBookCrossed: boolean;
  noBookCrossed: boolean;
  yesBookLocked: boolean;
  noBookLocked: boolean;
};

function isPresentPrice(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function isValidIntegerPrice(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

function signedSpread(bid: number | null, ask: number | null): number | null {
  if (!isPresentPrice(bid) || !isPresentPrice(ask)) {
    return null;
  }

  return ask - bid;
}

export function classifyTopOfBookEconomicValidity(
  input: TopOfBookEconomicValidityInput,
): TopOfBookEconomicValidityResult {
  const yesSignedSpreadCents = signedSpread(
    input.yesBestBidCents ?? null,
    input.yesBestAskCents ?? null,
  );
  const noSignedSpreadCents = signedSpread(
    input.noBestBidCents ?? null,
    input.noBestAskCents ?? null,
  );

  const yesBookCrossed =
    isPresentPrice(input.yesBestBidCents)
    && isPresentPrice(input.yesBestAskCents)
    && input.yesBestBidCents > input.yesBestAskCents;
  const noBookCrossed =
    isPresentPrice(input.noBestBidCents)
    && isPresentPrice(input.noBestAskCents)
    && input.noBestBidCents > input.noBestAskCents;
  const yesBookLocked =
    isPresentPrice(input.yesBestBidCents)
    && isPresentPrice(input.yesBestAskCents)
    && input.yesBestBidCents === input.yesBestAskCents;
  const noBookLocked =
    isPresentPrice(input.noBestBidCents)
    && isPresentPrice(input.noBestAskCents)
    && input.noBestBidCents === input.noBestAskCents;

  if (input.bookState === "awaiting-snapshot") {
    return {
      economicBookState: "awaiting-snapshot",
      economicInvalidReasons: ["Awaiting orderbook snapshot."],
      isEconomicallyValid: false,
      isParityUsable: false,
      yesSignedSpreadCents,
      noSignedSpreadCents,
      yesBookCrossed,
      noBookCrossed,
      yesBookLocked,
      noBookLocked,
    };
  }

  if (input.bookState !== "valid") {
    return {
      economicBookState: "awaiting-snapshot",
      economicInvalidReasons: [`Capture bookState is ${input.bookState}.`],
      isEconomicallyValid: false,
      isParityUsable: false,
      yesSignedSpreadCents,
      noSignedSpreadCents,
      yesBookCrossed,
      noBookCrossed,
      yesBookLocked,
      noBookLocked,
    };
  }

  const prices = [
    input.yesBestBidCents,
    input.yesBestAskCents,
    input.noBestBidCents,
    input.noBestAskCents,
  ];
  const invalidPrice = prices.some(
    (price) =>
      isPresentPrice(price)
      && !isValidIntegerPrice(price),
  );
  const malformedPrice = prices.some(
    (price) => price !== null && price !== undefined && !Number.isFinite(price),
  );

  if (invalidPrice || malformedPrice) {
    return {
      economicBookState: "invalid-price",
      economicInvalidReasons: ["Price outside 0-100 integer cents or malformed."],
      isEconomicallyValid: false,
      isParityUsable: false,
      yesSignedSpreadCents,
      noSignedSpreadCents,
      yesBookCrossed,
      noBookCrossed,
      yesBookLocked,
      noBookLocked,
    };
  }

  const missingYesBid = !isPresentPrice(input.yesBestBidCents);
  const missingYesAsk = !isPresentPrice(input.yesBestAskCents);
  const missingNoBid = !isPresentPrice(input.noBestBidCents);
  const missingNoAsk = !isPresentPrice(input.noBestAskCents);

  if (missingYesBid || missingYesAsk || missingNoBid || missingNoAsk) {
    const reasons: string[] = [];
    if (missingYesBid) {
      reasons.push("Missing YES bid.");
    }
    if (missingYesAsk) {
      reasons.push("Missing YES ask.");
    }
    if (missingNoBid) {
      reasons.push("Missing NO bid.");
    }
    if (missingNoAsk) {
      reasons.push("Missing NO ask.");
    }

    return {
      economicBookState: "insufficient-depth",
      economicInvalidReasons: reasons,
      isEconomicallyValid: false,
      isParityUsable: false,
      yesSignedSpreadCents,
      noSignedSpreadCents,
      yesBookCrossed,
      noBookCrossed,
      yesBookLocked,
      noBookLocked,
    };
  }

  if (yesBookCrossed || noBookCrossed) {
    const reasons: string[] = [];
    if (yesBookCrossed) {
      reasons.push(
        `YES book crossed: bid ${input.yesBestBidCents} > ask ${input.yesBestAskCents}.`,
      );
    }
    if (noBookCrossed) {
      reasons.push(
        `NO book crossed: bid ${input.noBestBidCents} > ask ${input.noBestAskCents}.`,
      );
    }

    return {
      economicBookState: "sequence-valid-crossed",
      economicInvalidReasons: reasons,
      isEconomicallyValid: false,
      isParityUsable: false,
      yesSignedSpreadCents,
      noSignedSpreadCents,
      yesBookCrossed,
      noBookCrossed,
      yesBookLocked,
      noBookLocked,
    };
  }

  if (yesBookLocked || noBookLocked) {
    const reasons: string[] = [];
    if (yesBookLocked) {
      reasons.push("YES book locked.");
    }
    if (noBookLocked) {
      reasons.push("NO book locked.");
    }

    return {
      economicBookState: "sequence-valid-locked",
      economicInvalidReasons: reasons,
      isEconomicallyValid: false,
      isParityUsable: false,
      yesSignedSpreadCents,
      noSignedSpreadCents,
      yesBookCrossed,
      noBookCrossed,
      yesBookLocked,
      noBookLocked,
    };
  }

  const parityDiagnostics = classifyParitySnapshot(
    {
      yesBidCents: input.yesBestBidCents ?? null,
      yesAskCents: input.yesBestAskCents ?? null,
      noBidCents: input.noBestBidCents ?? null,
      noAskCents: input.noBestAskCents ?? null,
      yesBestBidSize: input.yesBestBidSize ?? null,
      yesBestAskSize: input.yesBestAskSize ?? null,
      noBestBidSize: input.noBestBidSize ?? null,
      noBestAskSize: input.noBestAskSize ?? null,
      bookState: input.bookState,
    },
    DEFAULT_STATIC_PARITY_FRICTION_CONFIG,
  );

  const isParityUsable =
    parityDiagnostics.classification !== "invalid-book-state"
    && parityDiagnostics.classification !== "insufficient-book-depth";

  if (!isParityUsable) {
    return {
      economicBookState: "insufficient-depth",
      economicInvalidReasons: [parityDiagnostics.reason],
      isEconomicallyValid: true,
      isParityUsable: false,
      yesSignedSpreadCents,
      noSignedSpreadCents,
      yesBookCrossed,
      noBookCrossed,
      yesBookLocked,
      noBookLocked,
    };
  }

  return {
    economicBookState: "economically-valid",
    economicInvalidReasons: [],
    isEconomicallyValid: true,
    isParityUsable: true,
    yesSignedSpreadCents,
    noSignedSpreadCents,
    yesBookCrossed,
    noBookCrossed,
    yesBookLocked,
    noBookLocked,
  };
}

export type TopOfBookEconomicFields = TopOfBookEconomicValidityResult;

export function resolveTopOfBookEconomicFields(
  input: TopOfBookEconomicValidityInput & Partial<TopOfBookEconomicFields>,
): TopOfBookEconomicFields {
  if (input.economicBookState !== undefined) {
    return {
      economicBookState: input.economicBookState,
      economicInvalidReasons: input.economicInvalidReasons ?? [],
      isEconomicallyValid: input.isEconomicallyValid ?? false,
      isParityUsable: input.isParityUsable ?? false,
      yesSignedSpreadCents: input.yesSignedSpreadCents ?? signedSpread(
        input.yesBestBidCents ?? null,
        input.yesBestAskCents ?? null,
      ),
      noSignedSpreadCents: input.noSignedSpreadCents ?? signedSpread(
        input.noBestBidCents ?? null,
        input.noBestAskCents ?? null,
      ),
      yesBookCrossed: input.yesBookCrossed ?? false,
      noBookCrossed: input.noBookCrossed ?? false,
      yesBookLocked: input.yesBookLocked ?? false,
      noBookLocked: input.noBookLocked ?? false,
    };
  }

  return classifyTopOfBookEconomicValidity(input);
}
