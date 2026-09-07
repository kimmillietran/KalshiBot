import { describe, expect, it } from "vitest";

import {
  V2_REQUIRED_PROVIDER,
  V2_REQUIRED_PROVIDER_INSTRUMENT,
  V2_REQUIRED_SOURCE_RECORD_TYPE,
} from "../calibrationFadeV2Preregistration";

import { CalibrationFadeV2ForwardValidationError } from "./calibrationFadeV2ForwardValidationTypes";
import {
  derivedOneMinuteCloseTimeMs,
  parseClosedMinuteObservation,
} from "./parseClosedMinuteObservation";

const OPEN = "2026-09-07T12:00:00.000Z";
const CLOSE = "2026-09-07T12:00:59.999Z";

function validObservation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "coinbase-exchange-rest-candles",
    provider: V2_REQUIRED_PROVIDER,
    productId: V2_REQUIRED_PROVIDER_INSTRUMENT,
    sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
    granularityMs: 60_000,
    candleOpenTime: OPEN,
    candleCloseTime: CLOSE,
    open: 100_000,
    high: 100_200,
    low: 99_800,
    close: 100_050,
    volume: 12.5,
    observedAtLocal: "2026-09-07T12:01:02.000Z",
    firstObservedAtLocal: "2026-09-07T12:01:02.000Z",
    retrievalMethod: "synthetic-fixture",
    ...overrides,
  };
}

describe("parseClosedMinuteObservation", () => {
  it("accepts a Coinbase BTC-USD closed-minute observation with historical 1m close identity", () => {
    const parsed = parseClosedMinuteObservation(validObservation(), {
      requireObservationTimestamp: true,
    });
    expect(parsed.provider).toBe("coinbase-spot");
    expect(parsed.productId).toBe("BTC-USD");
    expect(parsed.sourceRecordType).toBe("exchange-completed-1m-ohlc");
    expect(parsed.closeTimeMs).toBe(parsed.openTimeMs + 59_999);
    expect(parsed.closeTimeMs).toBe(derivedOneMinuteCloseTimeMs(parsed.openTimeMs));
    expect(parsed.ohlcComplete).toBe(true);
  });

  it("requires candleCloseTime === candleOpenTime + 59_999ms", () => {
    expect(() =>
      parseClosedMinuteObservation(
        validObservation({ candleCloseTime: "2026-09-07T12:01:00.000Z" }),
        { requireObservationTimestamp: true },
      ),
    ).toThrow(/59999ms/);
  });

  it("rejects a mapper that timestamps the candle at bucket open", () => {
    expect(() =>
      parseClosedMinuteObservation(
        validObservation({ candleCloseTime: OPEN }),
        { requireObservationTimestamp: true },
      ),
    ).toThrow(CalibrationFadeV2ForwardValidationError);
  });

  it("rejects malformed or non-finite OHLC", () => {
    expect(() =>
      parseClosedMinuteObservation(validObservation({ high: Number.NaN }), {
        requireObservationTimestamp: true,
      }),
    ).toThrow(/finite/);
    expect(() =>
      parseClosedMinuteObservation(validObservation({ close: 0 }), {
        requireObservationTimestamp: true,
      }),
    ).toThrow(/finite and positive/);
    expect(() =>
      parseClosedMinuteObservation(validObservation({ high: 99_000, low: 100_000 }), {
        requireObservationTimestamp: true,
      }),
    ).toThrow(/malformed/);
  });

  it("rejects the wrong provider", () => {
    expect(() =>
      parseClosedMinuteObservation(validObservation({ provider: "binance" }), {
        requireObservationTimestamp: true,
      }),
    ).toThrow(/Wrong provider/);
  });

  it("rejects the wrong product", () => {
    expect(() =>
      parseClosedMinuteObservation(validObservation({ productId: "ETH-USD" }), {
        requireObservationTimestamp: true,
      }),
    ).toThrow(/Wrong product/);
  });

  it("fails confirmatory parsing when observedAtLocal is missing", () => {
    const rest = validObservation();
    delete rest.observedAtLocal;
    delete rest.firstObservedAtLocal;
    expect(() =>
      parseClosedMinuteObservation(rest, { requireObservationTimestamp: true }),
    ).toThrow(/observedAtLocal is required/);
  });
});
