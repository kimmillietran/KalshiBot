import type { CalibrationFadeMarketRecord } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";

import { CalibrationFadeV2CrossRunValidationError } from "./calibrationFadeV2CrossRunValidationTypes";

function isPresent(value: number | null | undefined): value is number {
  return value !== null && value !== undefined;
}

/**
 * Both executable return fields must be present together, or both absent.
 * A missing return is unknown — never a zero. Partial pairs fail closed.
 */
export function assertV2ExecutableReturnPairIntegrity(
  market: CalibrationFadeMarketRecord,
  context: string,
): void {
  const grossPresent = isPresent(market.grossReturnCents);
  const feePresent = isPresent(market.feeAdjustedReturnCents);
  if (grossPresent !== feePresent) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `${context}: partial executable returns are malformed sealed evidence `
        + `(grossReturnCents=${JSON.stringify(market.grossReturnCents)}, `
        + `feeAdjustedReturnCents=${JSON.stringify(market.feeAdjustedReturnCents)})`,
    );
  }
  if (grossPresent && !Number.isFinite(market.grossReturnCents)) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `${context}: grossReturnCents must be a finite number when present`,
    );
  }
  if (feePresent && !Number.isFinite(market.feeAdjustedReturnCents)) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `${context}: feeAdjustedReturnCents must be a finite number when present`,
    );
  }
}

/** True only when both sealed/overlay return fields are valid finite numbers. */
export function isV2ExecutableReturnEvaluable(market: CalibrationFadeMarketRecord): boolean {
  return Number.isFinite(market.grossReturnCents) && Number.isFinite(market.feeAdjustedReturnCents);
}
