import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { deriveBboCentsFromBooks } from "../m17RetainedInputRecoveryAudit/offlineDerivers";
import {
  assertPreentryFeaturesAreCausal,
  buildM17PreentryFeatureRecoveryReport,
  computePreentryRealizedVolatility,
  enrichBookRowWithVolatility,
  M17_PREENTRY_VOLATILITY_CONTRACT,
  summarizeFeatureCoverage,
  volatilityWindowLeaksFuture,
  type CompletedMinuteBar,
  type PreentryBookFeatureRow,
} from "./index";

const OPEN0 = Date.parse("2026-08-14T12:00:00.000Z");

function barAt(minuteIndex: number, close: number): CompletedMinuteBar {
  const openTimeMs = OPEN0 + minuteIndex * 60_000;
  return {
    openTimeMs,
    closeTimeMs: openTimeMs + M17_PREENTRY_VOLATILITY_CONTRACT.candleCloseOffsetMs,
    open: close,
    high: close,
    low: close,
    close,
  };
}

function makeBars(count: number, closes: number[]): CompletedMinuteBar[] {
  return closes.slice(0, count).map((c, i) => barAt(i, c));
}

describe("m17PreentryFeatureRecovery", () => {
  it("uses frozen lookbackBars=10 and requiredCloseCount=11", () => {
    expect(M17_PREENTRY_VOLATILITY_CONTRACT.lookbackBars).toBe(10);
    expect(M17_PREENTRY_VOLATILITY_CONTRACT.requiredCloseCount).toBe(11);
    expect(M17_PREENTRY_VOLATILITY_CONTRACT.candleCloseOffsetMs).toBe(59_999);
    expect(M17_PREENTRY_VOLATILITY_CONTRACT.citedHighVolMinInclusive).toBe(0.6);
  });

  it("derives executable NO ask as 100 − YES bid", () => {
    const books = {
      bids: new Map([[0.42, 10]]),
      asks: new Map([[0.44, 8]]),
    };
    const bbo = deriveBboCentsFromBooks(books);
    expect(bbo).not.toBeNull();
    expect(bbo!.yesBidCents).toBe(42);
    expect(bbo!.yesAskCents).toBe(44);
    expect(bbo!.yesMidpoint).toBeCloseTo(0.43);
    expect(bbo!.noAskCents).toBe(58);
  });

  it("selects only candles with closeTimeMs < entry (completed-candle convention)", () => {
    const bars = makeBars(15, Array.from({ length: 15 }, (_, i) => 100 + i));
    // Entry exactly at close of minute 14 → that candle is NOT eligible.
    const entryAtClose = bars[14]!.closeTimeMs;
    const atClose = computePreentryRealizedVolatility({
      barsAscendingByClose: bars,
      entryTimestampMs: entryAtClose,
    });
    expect(atClose.status).toBe("ok");
    expect(atClose.selectedOpenTimeMs).toHaveLength(11);
    expect(Math.max(...atClose.selectedCandles.map((c) => c.timestamp))).toBeLessThan(
      entryAtClose,
    );

    // Entry one ms after close of minute 14 → minute 14 included as newest.
    const afterClose = computePreentryRealizedVolatility({
      barsAscendingByClose: bars,
      entryTimestampMs: entryAtClose + 1,
    });
    expect(afterClose.status).toBe("ok");
    expect(afterClose.selectedOpenTimeMs[10]).toBe(bars[14]!.openTimeMs);
  });

  it("fails closed on insufficient completed candles", () => {
    const bars = makeBars(5, [1, 2, 3, 4, 5]);
    const result = computePreentryRealizedVolatility({
      barsAscendingByClose: bars,
      entryTimestampMs: bars[4]!.closeTimeMs + 1,
    });
    expect(result.status).toBe("insufficient-completed-minutes");
    expect(result.annualizedRealizedVolatility).toBeNull();
  });

  it("detects future / in-progress candle leakage", () => {
    const entry = OPEN0 + 600_000;
    expect(volatilityWindowLeaksFuture([entry - 1], entry)).toBe(false);
    expect(volatilityWindowLeaksFuture([entry], entry)).toBe(true);
    expect(volatilityWindowLeaksFuture([entry + 1], entry)).toBe(true);

    const leak = assertPreentryFeaturesAreCausal({
      entryTimestampMs: entry,
      closeTimeMs: entry + 900_000,
      bookTimestampMs: entry,
      candleCloseTimeMs: [entry + 1],
      usedSettlementLabel: false,
      usedExpirationValue: false,
    });
    expect(leak.safe).toBe(false);
    expect(leak.reasons).toContain("used-future-candle");

    const settlementLeak = assertPreentryFeaturesAreCausal({
      entryTimestampMs: entry,
      closeTimeMs: entry + 900_000,
      bookTimestampMs: entry,
      candleCloseTimeMs: [entry - 1],
      usedSettlementLabel: true,
      usedExpirationValue: true,
    });
    expect(settlementLeak.reasons).toEqual(
      expect.arrayContaining(["used-settlement-label", "used-expiration-value"]),
    );
  });

  it("marks market+time+vol complete only when all three are present", () => {
    const bars = makeBars(
      12,
      Array.from({ length: 12 }, (_, i) => 100 + i * 0.1),
    );
    const book: PreentryBookFeatureRow = {
      utcDayKey: "2026-08-14",
      marketTicker: "KXBTC15M-26AUG141200-00",
      entryTimestampMs: bars[11]!.closeTimeMs + 1,
      closeTimeMs: bars[11]!.closeTimeMs + 900_000,
      timeRemainingMs: 900_000 - 1,
      yesBidCents: 40,
      yesAskCents: 42,
      yesMidpoint: 0.41,
      noAskCents: 60,
      halfSpreadCents: 1,
      bookFeatureStatus: "ok",
      halfSpreadMismatch: null,
    };
    const enriched = enrichBookRowWithVolatility({
      book,
      barsAscendingByClose: bars,
      candlesAvailable: true,
    });
    expect(enriched.marketFeaturesComplete).toBe(true);
    expect(enriched.timeFeaturesComplete).toBe(true);
    expect(enriched.volatilityFeatureComplete).toBe(true);
    expect(enriched.marketTimeVolFeaturesComplete).toBe(true);
    expect(enriched.annualizedRealizedVolatility).not.toBeNull();

    const incomplete = enrichBookRowWithVolatility({
      book: { ...book, bookFeatureStatus: "missing-bbo", yesBidCents: undefined },
      barsAscendingByClose: bars,
      candlesAvailable: true,
    });
    expect(incomplete.marketTimeVolFeaturesComplete).toBe(false);
  });

  it("builds a coverage report with no-strategy attestation", () => {
    const report = buildM17PreentryFeatureRecoveryReport({
      generatedAtUtc: "2026-09-25T00:00:00.000Z",
      codeAuthoritySha: "abc",
      baseMainSha: "def",
      samplesPath: "samples.jsonl",
      samplesSha256: createHash("sha256").update("x").digest("hex"),
      samplesRowCount: 1,
      rawZipDir: "raw",
      rawZipCount: 34,
      adapterId: "RAW-BBO-CHANGE",
      adapterIdentity: "3f37ecb7",
      bookFeaturesPath: null,
      bookFeaturesSha256: null,
      candlesDir: null,
      rows: [],
      candleCoverageByDay: [],
      coinbaseRetrieval: {
        attempted: false,
        usableWithoutCost: null,
        authenticationRequired: false,
        purchaseOrSubscriptionEncountered: false,
        blocker: null,
        retrievedUtcDays: 0,
        totalCandles: 0,
        timestampConvention: "not-retrieved",
      },
    });
    expect(report.attestation.strategyPnlComputed).toBe(false);
    expect(report.attestation.strategyResultClaimed).toBe(false);
    expect(report.attestation.purchaseOccurred).toBe(false);
    expect(summarizeFeatureCoverage([]).marketTimeVolComplete).toBe(0);
  });
});
