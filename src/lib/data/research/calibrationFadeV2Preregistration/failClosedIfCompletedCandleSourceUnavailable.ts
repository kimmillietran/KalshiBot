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
 * Callers must not silently substitute BTC spot ticks.
 */
export function failClosedIfCompletedCandleSourceUnavailable(input: {
  sourceRecordType: string | null | undefined;
  sourceAvailable?: boolean;
  volatilityDefinition?: Pick<CalibrationFadeV2VolatilityDefinition, "sourceRecordType">;
}): never | void {
  const expected =
    input.volatilityDefinition?.sourceRecordType ?? V2_REQUIRED_SOURCE_RECORD_TYPE;
  const available = input.sourceAvailable !== false;
  const matches = input.sourceRecordType === expected;

  if (!available || !matches) {
    throw new CalibrationFadeV2PreregistrationError(
      `v2 completed-candle source unavailable or mismatched: required ${expected}, `
        + `received ${JSON.stringify(input.sourceRecordType)}; silent spot-tick fallback is forbidden`,
    );
  }
}
