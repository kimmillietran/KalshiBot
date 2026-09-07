import {
  CalibrationFadeV2PreregistrationError,
  V2_REQUIRED_SOURCE_RECORD_TYPE,
  type CalibrationFadeV2VolatilityDefinition,
} from "./calibrationFadeV2PreregistrationTypes";

/**
 * Contract constant: v2 volatility evaluation requires exchange-completed 1m OHLC.
 * Spot ticks / in-progress minute samples are not a valid substitute.
 */
export const V2_COMPLETED_CANDLE_SOURCE_CONTRACT = {
  sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
  silentSpotTickFallbackAllowed: false,
  failClosedWhenUnavailable: true,
} as const;

/**
 * Fail closed when the required completed-candle source is unavailable.
 * Availability is proven only by an explicit `sourceAvailable === true`.
 * Omitted / undefined / false are all unavailable. Callers must not silently
 * substitute BTC spot ticks.
 */
export function failClosedIfCompletedCandleSourceUnavailable(input: {
  sourceRecordType: string | null | undefined;
  /** Must be explicitly true; omitted/undefined/false fail closed. */
  sourceAvailable: boolean;
  volatilityDefinition?: Pick<CalibrationFadeV2VolatilityDefinition, "sourceRecordType">;
}): never | void {
  const expected =
    input.volatilityDefinition?.sourceRecordType ?? V2_REQUIRED_SOURCE_RECORD_TYPE;
  const matches = input.sourceRecordType === expected;
  // Explicit true only — do not treat omitted/undefined as available (Object.is
  // also rejects accidental non-boolean truthy values if callers cast).
  const available = Object.is(input.sourceAvailable, true);

  if (!available || !matches) {
    throw new CalibrationFadeV2PreregistrationError(
      `v2 completed-candle source unavailable or mismatched: required ${expected}, `
        + `received ${JSON.stringify(input.sourceRecordType)}, `
        + `sourceAvailable=${JSON.stringify(input.sourceAvailable)}; `
        + `silent spot-tick fallback is forbidden`,
    );
  }
}
