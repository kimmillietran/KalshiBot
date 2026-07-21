import { describe, expect, it } from "vitest";

import { validateCalibrationFadeMarketRecord } from "./parseCalibrationFadeMarketRecord";

function validRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    marketTicker: "KXBTC15M-26JUL111200-00",
    entryTimestamp: "2026-07-11T18:00:00.000Z",
    impliedYesProbability: 0.57,
    noAskCents: 43,
    executableAvailable: true,
    settlementStatus: "known",
    settledOutcome: "yes",
    grossReturnCents: -43,
    feeAdjustedReturnCents: -44,
    calibrationGapSigned: -0.43,
    ...overrides,
  };
}

describe("validateCalibrationFadeMarketRecord", () => {
  it("accepts a fully valid evaluated record", () => {
    const result = validateCalibrationFadeMarketRecord(validRow());
    expect(result.errors).toEqual([]);
    expect(result.record?.marketTicker).toBe("KXBTC15M-26JUL111200-00");
  });

  it("accepts an unsettled non-executable record with null evaluation fields", () => {
    const result = validateCalibrationFadeMarketRecord(
      validRow({
        noAskCents: null,
        executableAvailable: false,
        settlementStatus: "missing-source",
        settledOutcome: "unknown",
        grossReturnCents: null,
        feeAdjustedReturnCents: null,
        calibrationGapSigned: null,
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.record?.settledOutcome).toBe("unknown");
  });

  it("rejects an empty object", () => {
    const result = validateCalibrationFadeMarketRecord({});
    expect(result.record).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects non-object rows", () => {
    expect(validateCalibrationFadeMarketRecord(null).record).toBeNull();
    expect(validateCalibrationFadeMarketRecord([validRow()]).record).toBeNull();
    expect(validateCalibrationFadeMarketRecord("row").record).toBeNull();
  });

  it("rejects an empty market ticker", () => {
    const result = validateCalibrationFadeMarketRecord(validRow({ marketTicker: "  " }));
    expect(result.record).toBeNull();
    expect(result.errors.some((error) => error.includes("marketTicker"))).toBe(true);
  });

  it("rejects an unparseable entry timestamp", () => {
    const result = validateCalibrationFadeMarketRecord(
      validRow({ entryTimestamp: "not-a-date" }),
    );
    expect(result.record).toBeNull();
    expect(result.errors.some((error) => error.includes("entryTimestamp"))).toBe(true);
  });

  it("rejects implied probability outside 0-1 or non-finite", () => {
    expect(
      validateCalibrationFadeMarketRecord(validRow({ impliedYesProbability: 1.2 })).record,
    ).toBeNull();
    expect(
      validateCalibrationFadeMarketRecord(validRow({ impliedYesProbability: -0.1 })).record,
    ).toBeNull();
    expect(
      validateCalibrationFadeMarketRecord(validRow({ impliedYesProbability: Number.NaN })).record,
    ).toBeNull();
  });

  it("rejects an executable price outside the cents range", () => {
    const result = validateCalibrationFadeMarketRecord(validRow({ noAskCents: 250 }));
    expect(result.record).toBeNull();
    expect(result.errors.some((error) => error.includes("noAskCents"))).toBe(true);
  });

  it("rejects executableAvailable=true with a null executable price", () => {
    const result = validateCalibrationFadeMarketRecord(
      validRow({ noAskCents: null, grossReturnCents: null, feeAdjustedReturnCents: null }),
    );
    expect(result.record).toBeNull();
    expect(result.errors.some((error) => error.includes("executableAvailable"))).toBe(true);
  });

  it("rejects return fields on a non-executable market", () => {
    const result = validateCalibrationFadeMarketRecord(
      validRow({
        noAskCents: null,
        executableAvailable: false,
        feeAdjustedReturnCents: -44,
        grossReturnCents: null,
      }),
    );
    expect(result.record).toBeNull();
    expect(result.errors.some((error) => error.includes("feeAdjustedReturnCents"))).toBe(true);
  });

  it("rejects return fields on an unsettled market", () => {
    const result = validateCalibrationFadeMarketRecord(
      validRow({ settledOutcome: "unknown", calibrationGapSigned: null }),
    );
    expect(result.record).toBeNull();
  });

  it("rejects an invalid settled outcome enum value", () => {
    const result = validateCalibrationFadeMarketRecord(validRow({ settledOutcome: "maybe" }));
    expect(result.record).toBeNull();
    expect(result.errors.some((error) => error.includes("settledOutcome"))).toBe(true);
  });

  it("rejects a calibration gap outside -1..1 or on an unsettled market", () => {
    expect(
      validateCalibrationFadeMarketRecord(validRow({ calibrationGapSigned: 2 })).record,
    ).toBeNull();
    expect(
      validateCalibrationFadeMarketRecord(
        validRow({
          settledOutcome: "unknown",
          grossReturnCents: null,
          feeAdjustedReturnCents: null,
          calibrationGapSigned: -0.43,
        }),
      ).record,
    ).toBeNull();
  });

  it("rejects non-finite return values", () => {
    const result = validateCalibrationFadeMarketRecord(
      validRow({ grossReturnCents: Number.POSITIVE_INFINITY }),
    );
    expect(result.record).toBeNull();
  });
});
