import { describe, expect, it } from "vitest";

import { computeKalshiScheduleFeeCents } from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";
import { computeEntryTakerFeeCents } from "@/lib/data/research/calibrationFadeV2SpentGridHtsExploratory";

import {
  CF_V2_NO_GRID_EXPECTED,
  classifyYesAskSize,
  computeYesHoldToSettlementPnl,
  interpretYesMirrorDiagnostic,
  pairedSideIdentityResidualCents,
  runYesMirrorDiagnostic,
  verifyNoSideTradeConsistent,
  type NoSideTradeRow,
} from "./index";

function noTrade(over: Partial<NoSideTradeRow> = {}): NoSideTradeRow {
  const yesBidCents = over.yesBidCents ?? 40;
  const yesAskCents = over.yesAskCents ?? 42;
  const noAskCents = over.noAskCents ?? 100 - yesBidCents;
  const settlementResult = over.settlementResult ?? "no";
  const entryFeeCents =
    over.entryFeeCents
    ?? computeEntryTakerFeeCents(noAskCents);
  const grossPnlCents =
    over.grossPnlCents
    ?? (settlementResult === "no" ? 100 - noAskCents : -noAskCents);
  const netPnlCents = over.netPnlCents ?? grossPnlCents - entryFeeCents;
  return {
    marketTicker: over.marketTicker ?? "M1",
    utcDayKey: over.utcDayKey ?? "2026-08-14",
    entryTimestampMs: over.entryTimestampMs ?? 1_000_000,
    yesBidCents,
    yesAskCents,
    noAskCents,
    yesBidSize: over.yesBidSize === undefined ? 10 : over.yesBidSize,
    yesAskSize: over.yesAskSize === undefined ? 10 : over.yesAskSize,
    settlementResult,
    entryFeeCents,
    grossPnlCents,
    netPnlCents,
  };
}

describe("calibrationFadeV2SpentGridHtsYesMirrorDiagnostic", () => {
  it("computes YES hold-to-settlement payoff and STANDARD taker fee", () => {
    const fee = computeEntryTakerFeeCents(42);
    expect(fee).toBe(
      computeKalshiScheduleFeeCents({
        quantity: 1,
        priceCents: 42,
        role: "taker",
        schedule: "standard",
      }),
    );
    expect(
      computeYesHoldToSettlementPnl({
        yesAskCents: 42,
        settlementResult: "yes",
        entryFeeCents: fee,
      }),
    ).toEqual({ grossPnlCents: 58, netPnlCents: 58 - fee });
    expect(
      computeYesHoldToSettlementPnl({
        yesAskCents: 42,
        settlementResult: "no",
        entryFeeCents: fee,
      }),
    ).toEqual({ grossPnlCents: -42, netPnlCents: -42 - fee });
  });

  it("verifies paired identity for both settlement outcomes", () => {
    for (const settlementResult of ["yes", "no"] as const) {
      const trade = noTrade({ settlementResult });
      expect(verifyNoSideTradeConsistent(trade)).toBe(true);
      const yesFee = computeEntryTakerFeeCents(trade.yesAskCents);
      const yesPnl = computeYesHoldToSettlementPnl({
        yesAskCents: trade.yesAskCents,
        settlementResult,
        entryFeeCents: yesFee,
      });
      const residual = pairedSideIdentityResidualCents({
        yesBidCents: trade.yesBidCents,
        yesAskCents: trade.yesAskCents,
        noAskCents: trade.noAskCents,
        yesFeeCents: yesFee,
        noFeeCents: trade.entryFeeCents,
        yesNetPnlCents: yesPnl.netPnlCents,
        noNetPnlCents: trade.netPnlCents,
      });
      expect(residual).toBe(0);
    }
  });

  it("preserves exact cohort tickers/timestamps and does not substitute entries", () => {
    const trades = [
      noTrade({ marketTicker: "A", entryTimestampMs: 100, utcDayKey: "2026-08-14" }),
      noTrade({
        marketTicker: "B",
        entryTimestampMs: 200,
        utcDayKey: "2026-08-15",
        settlementResult: "yes",
      }),
    ];
    const { report, pairedRows } = runYesMirrorDiagnostic({
      generatedAtUtc: "2026-01-01T00:00:00.000Z",
      codeAuthoritySha: "test",
      selectedEntriesSha256: CF_V2_NO_GRID_EXPECTED.selectedEntriesSha256,
      perMarketTradesSha256: CF_V2_NO_GRID_EXPECTED.perMarketTradesSha256,
      noTrades: trades,
    });
    expect(pairedRows).toHaveLength(2);
    expect(pairedRows.map((r) => r.marketTicker)).toEqual(["A", "B"]);
    expect(pairedRows.map((r) => r.entryTimestampMs)).toEqual([100, 200]);
    expect(report.cohort.hashesVerified).toBe(true);
    expect(report.attestation.originalNoOutputsModified).toBe(false);
    expect(report.priorExposure.yesMirrorSelectedAfterObservingNoResult).toBe(true);
    expect(report.priorExposure.isIndependentMechanismTest).toBe(false);
    expect(report.priorExposure.attemptedHistory).toEqual([
      "no-grid-hts-exploratory-v0 (PR #134)",
      "yes-mirror-diagnostic-v0 (this study; selected after observing #134)",
    ]);
  });

  it("marks missing YES ask as unevaluable without substituting another timestamp", () => {
    const trades = [
      noTrade({ marketTicker: "GOOD" }),
      {
        ...noTrade({ marketTicker: "BAD" }),
        yesAskCents: Number.NaN,
      },
    ];
    const { report, pairedRows } = runYesMirrorDiagnostic({
      generatedAtUtc: "2026-01-01T00:00:00.000Z",
      codeAuthoritySha: "test",
      selectedEntriesSha256: CF_V2_NO_GRID_EXPECTED.selectedEntriesSha256,
      perMarketTradesSha256: CF_V2_NO_GRID_EXPECTED.perMarketTradesSha256,
      noTrades: trades,
    });
    expect(pairedRows).toHaveLength(1);
    expect(pairedRows[0]!.marketTicker).toBe("GOOD");
    expect(report.cohort.unevaluableReasons["missing-yes-ask"]).toBe(1);
  });

  it("classifies YES ask size distinctly from YES bid size", () => {
    expect(classifyYesAskSize(5)).toBe("ok-ge-1");
    expect(classifyYesAskSize(1)).toBe("ok-ge-1");
    expect(classifyYesAskSize(0)).toBe("known-insufficient");
    expect(classifyYesAskSize(0.5)).toBe("known-insufficient");
    expect(classifyYesAskSize(null)).toBe("missing");
    expect(classifyYesAskSize(undefined)).toBe("missing");
  });

  it("reports liquidity sensitivity separately and keeps full cohort accounting", () => {
    const trades = [
      noTrade({
        marketTicker: "LIQ",
        yesAskSize: 10,
        utcDayKey: "2026-08-14",
      }),
      noTrade({
        marketTicker: "THIN",
        yesAskSize: 0,
        utcDayKey: "2026-08-15",
        settlementResult: "yes",
      }),
      noTrade({
        marketTicker: "MISS",
        yesAskSize: null,
        utcDayKey: "2026-08-16",
      }),
    ];
    const { report } = runYesMirrorDiagnostic({
      generatedAtUtc: "2026-01-01T00:00:00.000Z",
      codeAuthoritySha: "test",
      selectedEntriesSha256: CF_V2_NO_GRID_EXPECTED.selectedEntriesSha256,
      perMarketTradesSha256: CF_V2_NO_GRID_EXPECTED.perMarketTradesSha256,
      noTrades: trades,
    });
    expect(report.economics.n).toBe(3);
    expect(report.liquidity.yesAskSizeGe1).toBe(1);
    expect(report.liquidity.yesAskSizeKnownInsufficient).toBe(1);
    expect(report.liquidity.yesAskSizeMissing).toBe(1);
    expect(report.liquidity.sensitivityAskSizeGe1?.n).toBe(1);
    expect(report.accounting.identityHoldsForAllPairedRows).toBe(true);
  });

  it("interprets nonpositive economics as no support (distinct from insufficient N)", () => {
    expect(
      interpretYesMirrorDiagnostic({
        dataOk: true,
        n: 100,
        g: 20,
        meanNetPnlCents: -3,
        ci95LowerCents: -5,
        ci95UpperCents: -1,
      }).status,
    ).toBe("no-support-for-pursuing-yes-mirror");
    expect(
      interpretYesMirrorDiagnostic({
        dataOk: true,
        n: 10,
        g: 5,
        meanNetPnlCents: 2,
        ci95LowerCents: -1,
        ci95UpperCents: 5,
      }).status,
    ).toBe("insufficient-evidence-or-data-limitation");
    expect(
      interpretYesMirrorDiagnostic({
        dataOk: true,
        n: 100,
        g: 20,
        meanNetPnlCents: 2,
        ci95LowerCents: 0.5,
        ci95UpperCents: 3.5,
      }).status,
    ).toBe("exploratory-promise-only");
  });

  it("flags hash mismatch without inventing real-data P&L claims", () => {
    const { report } = runYesMirrorDiagnostic({
      generatedAtUtc: "2026-01-01T00:00:00.000Z",
      codeAuthoritySha: "test",
      selectedEntriesSha256: "deadbeef",
      perMarketTradesSha256: "cafebabe",
      noTrades: [noTrade()],
    });
    expect(report.cohort.hashesVerified).toBe(false);
    expect(report.interpretation.status).toBe(
      "insufficient-evidence-or-data-limitation",
    );
    expect(report.interpretation.meritsFreshPeriodTestDesign).toBe(false);
  });
});
