import { describe, expect, it } from "vitest";

import type { SettlementLabelRecord } from "@/lib/data/research/settlementFrictionCoverage";

import {
  M17_KNOWN_INCOMPLETE_MARKET_TICKER,
  entriesFromFrictionSamples,
  joinEligibleEntryToSettlementLabel,
  runM17SettlementJoinAudit,
  serializeM17SettlementJoinReportMarkdown,
} from "./index";

function label(
  partial: Partial<SettlementLabelRecord> & { marketTicker: string },
): SettlementLabelRecord {
  return {
    result: "yes",
    expirationValue: "65000.12",
    floorStrike: 65000,
    closeTime: "2026-08-14T00:00:00Z",
    settlementTs: "2026-08-14T00:00:01Z",
    ...partial,
  };
}

describe("joinEligibleEntryToSettlementLabel", () => {
  it("joins only on exact marketTicker with study-complete label", () => {
    const joined = joinEligibleEntryToSettlementLabel({
      entry: {
        marketTicker: "KXBTC15M-26AUG140000-00",
        utcDayKey: "2026-08-14",
        entryTimestampMs: 1,
        hasExecutableBookInputs: true,
      },
      label: label({ marketTicker: "KXBTC15M-26AUG140000-00", result: "no" }),
      conflictingTickers: new Set(),
      duplicateTickers: new Set(),
    });
    expect(joined.disposition).toBe("joined-valid-official-label");
    expect(joined.officialResult).toBe("no");
  });

  it("excludes the known incomplete ticker without inventing an outcome", () => {
    const joined = joinEligibleEntryToSettlementLabel({
      entry: {
        marketTicker: M17_KNOWN_INCOMPLETE_MARKET_TICKER,
        utcDayKey: "2026-08-14",
        entryTimestampMs: 1,
        hasExecutableBookInputs: true,
      },
      label: label({
        marketTicker: M17_KNOWN_INCOMPLETE_MARKET_TICKER,
        floorStrike: null,
      }),
      conflictingTickers: new Set(),
      duplicateTickers: new Set(),
    });
    expect(joined.disposition).toBe("excluded-known-incomplete-ticker");
    expect(joined.officialResult).toBeNull();
  });

  it("rejects conflicting and duplicate labels", () => {
    const conflicting = joinEligibleEntryToSettlementLabel({
      entry: {
        marketTicker: "KXBTC15M-DUP",
        utcDayKey: "2026-08-14",
        entryTimestampMs: 1,
        hasExecutableBookInputs: true,
      },
      label: label({ marketTicker: "KXBTC15M-DUP" }),
      conflictingTickers: new Set(["KXBTC15M-DUP"]),
      duplicateTickers: new Set(["KXBTC15M-DUP"]),
    });
    expect(conflicting.disposition).toBe("conflicting-or-duplicate-label");
  });

  it("rejects blank ticker as ambiguous identity", () => {
    const joined = joinEligibleEntryToSettlementLabel({
      entry: {
        marketTicker: "  ",
        utcDayKey: "2026-08-14",
        entryTimestampMs: 1,
        hasExecutableBookInputs: true,
      },
      label: undefined,
      conflictingTickers: new Set(),
      duplicateTickers: new Set(),
    });
    expect(joined.disposition).toBe("ambiguous-market-identity");
  });

  it("flags non-numeric expiration separately from missing", () => {
    const joined = joinEligibleEntryToSettlementLabel({
      entry: {
        marketTicker: "KXBTC15M-COMMA",
        utcDayKey: "2026-08-14",
        entryTimestampMs: 1,
        hasExecutableBookInputs: true,
      },
      label: label({
        marketTicker: "KXBTC15M-COMMA",
        expirationValue: "79,604.96",
      }),
      conflictingTickers: new Set(),
      duplicateTickers: new Set(),
    });
    expect(joined.disposition).toBe("non-numeric-expiration-value");
  });

  it("does not soft-match on approximate time or price (missing exact ticker)", () => {
    const joined = joinEligibleEntryToSettlementLabel({
      entry: {
        marketTicker: "KXBTC15M-A",
        utcDayKey: "2026-08-14",
        entryTimestampMs: 1_700_000_000_000,
        hasExecutableBookInputs: true,
      },
      label: undefined,
      conflictingTickers: new Set(),
      duplicateTickers: new Set(),
    });
    expect(joined.disposition).toBe("missing-label");
    expect(joined.officialResult).toBeNull();
  });
});

describe("runM17SettlementJoinAudit", () => {
  it("aggregates coverage and keeps confirmatory validity as spent", () => {
    const entries = entriesFromFrictionSamples([
      {
        marketTicker: "KXBTC15M-A",
        utcDayKey: "2026-08-14",
        entryTimestampMs: 1,
      },
      {
        marketTicker: "KXBTC15M-B",
        utcDayKey: "2026-08-14",
        entryTimestampMs: 2,
      },
      {
        marketTicker: "KXBTC15M-C",
        utcDayKey: "2026-08-15",
        entryTimestampMs: 3,
      },
      {
        marketTicker: "KXBTC15M-D",
        utcDayKey: "2026-08-15",
        entryTimestampMs: 4,
      },
      {
        marketTicker: "KXBTC15M-E",
        utcDayKey: "2026-08-16",
        entryTimestampMs: 5,
      },
      {
        marketTicker: M17_KNOWN_INCOMPLETE_MARKET_TICKER,
        utcDayKey: "2026-08-14",
        entryTimestampMs: 6,
      },
    ]);
    const labels = [
      label({ marketTicker: "KXBTC15M-A", result: "yes" }),
      label({ marketTicker: "KXBTC15M-B", result: "no" }),
      label({ marketTicker: "KXBTC15M-C", result: "yes" }),
      label({ marketTicker: "KXBTC15M-D", result: "no" }),
      label({ marketTicker: "KXBTC15M-E", result: "yes" }),
      label({
        marketTicker: M17_KNOWN_INCOMPLETE_MARKET_TICKER,
        floorStrike: null,
      }),
    ];

    const { report } = runM17SettlementJoinAudit({
      entries,
      labels,
      generatedAtUtc: "2026-09-25T00:00:00.000Z",
      codeAuthoritySha: "test",
      inputIdentities: { fixture: "unit" },
    });

    expect(report.counts.totalEligibleRecords).toBe(6);
    expect(report.counts.validOfficialSettlementLabel).toBe(5);
    expect(report.counts.excludedKnownIncompleteTicker).toBe(1);
    expect(report.counts.independentMarketsWithValidJoin).toBe(5);
    expect(report.decision.meetsMinimumIndependentMarkets).toBe(true);
    expect(report.decision.confirmatoryValidity).toBe(
      "not-confirmatory-spent-validation",
    );
    expect(report.counts.eligibleDatesRepresented).toBe(3);
    expect(report.decision.confirmatoryLimitation).toContain(
      "These 3 CryptoStruct days",
    );
    expect(report.excludedKnownIncompleteTicker).toBe(
      M17_KNOWN_INCOMPLETE_MARKET_TICKER,
    );
    expect(report.strategyDefinitionFixed.avg60sDataWiredIntoGates).toBe(false);
    expect(report.spentExploratoryOutcomeCounts.yes).toBe(3);
    expect(report.spentExploratoryOutcomeCounts.no).toBe(2);
    expect(report.zeroNetworkConfirmation.marketDataRequests).toBe(0);

    const md = serializeM17SettlementJoinReportMarkdown(report);
    expect(md).toContain("Settlement-join percentage");
    expect(md).toContain("not-confirmatory-spent-validation");
    expect(md).not.toMatch(/\bP&L\b|\bprofit\b/i);
  });
});
