import { classifyTopOfBookEconomicValidity } from "@/lib/data/live/forwardQuoteCapture/classifyTopOfBookEconomicValidity";

import type { ParsedTopOfBookValidationRecord } from "./captureQualityValidationTypes";

export type DerivedEconomicFields = {
  economicBookState: string;
  isEconomicallyValid: boolean;
  isParityUsable: boolean;
  isCrossed: boolean;
  isLocked: boolean;
};

/** Recomputes M12.4B economic validity from top-of-book prices for validation cross-checks. */
export function deriveEconomicFieldsFromRecord(
  record: ParsedTopOfBookValidationRecord,
): DerivedEconomicFields {
  const economic = classifyTopOfBookEconomicValidity({
    bookState: record.bookState,
    yesBestBidCents: record.yesBestBidCents,
    yesBestAskCents: record.yesBestAskCents,
    noBestBidCents: record.noBestBidCents,
    noBestAskCents: record.noBestAskCents,
    yesBestBidSize: record.yesBestBidSize,
    yesBestAskSize: record.yesBestAskSize,
    noBestBidSize: record.noBestBidSize,
    noBestAskSize: record.noBestAskSize,
  });

  return {
    economicBookState: economic.economicBookState,
    isEconomicallyValid: economic.isEconomicallyValid,
    isParityUsable: economic.isParityUsable,
    isCrossed: economic.yesBookCrossed || economic.noBookCrossed,
    isLocked: economic.yesBookLocked || economic.noBookLocked,
  };
}
