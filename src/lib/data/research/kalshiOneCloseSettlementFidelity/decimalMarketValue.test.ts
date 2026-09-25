import { describe, expect, it } from "vitest";

import {
  DECLARED_DECIMAL_APPROX_TOLERANCE_RAW,
  approximateDecimalEqual,
  compareMarketDecimals,
  exactDecimalDiffRaw,
  exactDecimalEqual,
  meanDecimalStrings,
  parseMarketDecimalString,
  roundHalfEven2DecimalString,
} from "./decimalMarketValue";

describe("decimalMarketValue exact equality", () => {
  it("treats v3 avg_60s_data as exact-decimal-equal to its reconstructed mean string", () => {
    const published = "84379.38516667";
    const samples = Array.from({ length: 60 }, () => "84379.38516667");
    const mean = meanDecimalStrings(samples, 8);
    expect(mean.meanRaw).toBe(published);
    expect(exactDecimalEqual(mean.meanRaw!, published)).toBe(true);
    const cmp = compareMarketDecimals(mean.meanRaw!, published);
    expect(cmp.rawStringEqual).toBe(true);
    expect(cmp.exactDecimalEqual).toBe(true);
    expect(cmp.approximateEqual).toBe(true);
    // IEEE float path is noisy — Number equality is not used for exactDecimalEqual.
    expect(Number(published) === Number(mean.meanRaw)).toBe(true);
  });

  it("keeps exact-decimal mean equality when IEEE float sum/divide === fails", () => {
    // 30×99.99999999 + 30×100.00000001 → exact decimal mean 100.00000000
    const published = "100.00000000";
    const samples = [
      ...Array.from({ length: 30 }, () => "99.99999999"),
      ...Array.from({ length: 30 }, () => "100.00000001"),
    ];
    let floatSum = 0;
    for (const sample of samples) {
      floatSum += Number(sample);
    }
    const floatMean = floatSum / samples.length;
    expect(floatMean === Number(published)).toBe(false);

    const mean = meanDecimalStrings(samples, 8);
    expect(mean.meanRaw).toBe(published);
    expect(exactDecimalEqual(mean.meanRaw!, published)).toBe(true);
    expect(compareMarketDecimals(mean.meanRaw!, published).exactDecimalEqual).toBe(true);
  });

  it("does not report inequality from float noise when strings differ only by representation scale", () => {
    expect(exactDecimalEqual("84379.38516667", "84379.385166670")).toBe(true);
    expect(exactDecimalEqual("1.0", "1.00")).toBe(true);
    expect(exactDecimalEqual("1.0", "1.00000001")).toBe(false);
  });

  it("distinguishes raw-string, exact-decimal, approximate, and diagnostic-round2 axes", () => {
    const left = "84379.38516667";
    const official = "84379.39";
    const cmp = compareMarketDecimals(left, official);
    expect(cmp.rawStringEqual).toBe(false);
    expect(cmp.exactDecimalEqual).toBe(false);
    expect(cmp.approximateEqual).toBe(false);
    expect(cmp.diagnosticRound2HalfEvenEqual).toBe(true);
    expect(cmp.approximateToleranceRaw).toBe(DECLARED_DECIMAL_APPROX_TOLERANCE_RAW);
    expect(exactDecimalDiffRaw(left, official)).toBe("-0.00483333");
  });

  it("reports approximate equality under the declared tolerance", () => {
    expect(approximateDecimalEqual("1.00000000", "1.000000005")).toBe(true);
    expect(approximateDecimalEqual("1.00000000", "1.00000002")).toBe(false);
  });

  it("parses and rejects unsupported formats", () => {
    expect(parseMarketDecimalString("84379.38516667")?.scale).toBe(8);
    expect(parseMarketDecimalString("1,234.56")).toBeNull();
    expect(parseMarketDecimalString("")).toBeNull();
  });

  it("matches diagnostic half-even 2dp for known M17 examples", () => {
    expect(roundHalfEven2DecimalString("83817.70733333")).toBe("83817.71");
    expect(roundHalfEven2DecimalString("83817.61766667")).toBe("83817.62");
    expect(roundHalfEven2DecimalString("84379.38516667")).toBe("84379.39");
    expect(roundHalfEven2DecimalString("84379.33416667")).toBe("84379.33");
  });
});
