import { describe, expect, it } from "vitest";

import { computeKalshiScheduleFeeCents } from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";

import {
  computeCr2TwoSidedMeanInference,
  computeEntryTakerFeeCents,
  computeHoldToSettlementPnl,
  evaluatePreentryEligibility,
  interpretExploratoryResult,
  isClassBReconstructionUncertain,
  joinSettlementOutcomes,
  retainedHalfReproducibleFromRegenCents,
  runCalibrationFadeV2SpentGridHtsStudy,
  selectEarliestEligibleEntries,
  studentTCriticalTwoSided95,
  type PreentryFeatureRow,
} from "./index";

function baseRow(over: Partial<PreentryFeatureRow> = {}): PreentryFeatureRow {
  return {
    utcDayKey: "2026-08-14",
    marketTicker: "KXBTC15M-26AUG141200-00",
    entryTimestampMs: 1_000_000,
    closeTimeMs: 1_900_000,
    timeRemainingMs: 600_000,
    yesBidCents: 40,
    yesAskCents: 42,
    yesMidpoint: 0.41,
    noAskCents: 60,
    yesBidSize: 5,
    yesAskSize: 5,
    crossed: false,
    locked: false,
    bookFeatureStatus: "ok",
    citedHighVolRegime: true,
    annualizedRealizedVolatility: 0.75,
    volatilityFeatureStatus: "ok",
    halfSpreadMismatch: null,
    ...over,
  };
}

describe("calibrationFadeV2SpentGridHtsExploratory", () => {
  it("enforces eligibility boundaries", () => {
    expect(evaluatePreentryEligibility(baseRow()).ok).toBe(true);
    expect(evaluatePreentryEligibility(baseRow({ yesMidpoint: 1 / 3 })).ok).toBe(true);
    expect(evaluatePreentryEligibility(baseRow({ yesMidpoint: 2 / 3 })).ok).toBe(false);
    expect(evaluatePreentryEligibility(baseRow({ yesMidpoint: 0.32 })).ok).toBe(false);
    expect(evaluatePreentryEligibility(baseRow({ timeRemainingMs: 0 })).ok).toBe(false);
    expect(evaluatePreentryEligibility(baseRow({ timeRemainingMs: 900_000 })).ok).toBe(false);
    expect(evaluatePreentryEligibility(baseRow({ crossed: true })).ok).toBe(false);
    expect(evaluatePreentryEligibility(baseRow({ locked: true })).ok).toBe(false);
    expect(evaluatePreentryEligibility(baseRow({ noAskCents: 0 })).ok).toBe(false);
    expect(evaluatePreentryEligibility(baseRow({ noAskCents: 100 })).ok).toBe(false);
    expect(
      evaluatePreentryEligibility(baseRow({ noAskCents: 59, yesBidCents: 40 })).ok,
    ).toBe(false);
    expect(evaluatePreentryEligibility(baseRow({ citedHighVolRegime: false })).ok).toBe(false);
    expect(evaluatePreentryEligibility(baseRow({ bookFeatureStatus: "missing-bbo" })).ok)
      .toBe(false);
  });

  it("selects earliest eligible entry per market and flags timestamp duplicates", () => {
    const rows = [
      baseRow({ entryTimestampMs: 2_000, marketTicker: "A" }),
      baseRow({ entryTimestampMs: 1_000, marketTicker: "A" }),
      baseRow({ entryTimestampMs: 1_500, marketTicker: "A", yesMidpoint: 0.2 }),
      baseRow({
        entryTimestampMs: 5_000,
        marketTicker: "B",
        utcDayKey: "2026-08-15",
      }),
      baseRow({
        entryTimestampMs: 5_000,
        marketTicker: "B",
        utcDayKey: "2026-08-15",
        yesAskCents: 43,
        yesMidpoint: 0.415,
      }),
    ];
    const selected = selectEarliestEligibleEntries(rows);
    expect(selected.eligibleRows).toBe(4);
    expect(selected.selected).toHaveLength(1);
    expect(selected.selected[0]!.marketTicker).toBe("A");
    expect(selected.selected[0]!.entryTimestampMs).toBe(1_000);
    expect(selected.duplicateConflicts).toHaveLength(1);
    expect(selected.duplicateConflicts[0]!.marketTicker).toBe("B");
  });

  it("computes settlement payoff and STANDARD taker fee without inventing rounding", () => {
    const fee = computeEntryTakerFeeCents(60);
    expect(fee).toBe(
      computeKalshiScheduleFeeCents({
        quantity: 1,
        priceCents: 60,
        role: "taker",
        schedule: "standard",
      }),
    );
    expect(computeHoldToSettlementPnl({
      noAskCents: 60,
      settlementResult: "no",
      entryFeeCents: fee,
    })).toEqual({ grossPnlCents: 40, netPnlCents: 40 - fee });
    expect(computeHoldToSettlementPnl({
      noAskCents: 60,
      settlementResult: "yes",
      entryFeeCents: fee,
    })).toEqual({ grossPnlCents: -60, netPnlCents: -60 - fee });
  });

  it("joins labels and reports missing / conflicting", () => {
    const entries = selectEarliestEligibleEntries([
      baseRow({ marketTicker: "M1" }),
      baseRow({ marketTicker: "M2", utcDayKey: "2026-08-15" }),
      baseRow({ marketTicker: "M3", utcDayKey: "2026-08-16" }),
    ]).selected;
    const join = joinSettlementOutcomes(entries, [
      { marketTicker: "M1", result: "no" },
      { marketTicker: "M2", result: "YES" },
      { marketTicker: "M3", result: "yes" },
      { marketTicker: "M3", result: "no" },
    ]);
    expect(join.evaluable).toHaveLength(2);
    expect(join.reasonCounts["missing-label"]).toBe(0);
    expect(join.reasonCounts["conflicting-labels"]).toBe(1);
  });

  it("does not reselect a later entry when the earliest lacks a label", () => {
    const rows = [
      baseRow({ marketTicker: "M", entryTimestampMs: 100 }),
      baseRow({ marketTicker: "M", entryTimestampMs: 200, yesAskCents: 41, yesMidpoint: 0.405 }),
    ];
    const selected = selectEarliestEligibleEntries(rows).selected;
    expect(selected).toHaveLength(1);
    expect(selected[0]!.entryTimestampMs).toBe(100);
    const join = joinSettlementOutcomes(selected, []);
    expect(join.evaluable).toHaveLength(0);
    expect(join.unevaluable[0]!.reason).toBe("missing-label");
  });

  it("classifies Class A vs Class B mismatch proxies", () => {
    // Class A: retained half reproducible (float NO-bid asymmetry)
    expect(
      retainedHalfReproducibleFromRegenCents({
        yesBidCents: 97,
        yesAskCents: 98,
        retainedHalfSpreadCents: 1.0,
      }),
    ).toBe(true);
    expect(
      isClassBReconstructionUncertain({
        yesBidCents: 97,
        yesAskCents: 98,
        halfSpreadMismatch: {
          retainedHalfSpreadCents: 1.0,
          regeneratedHalfSpreadCents: 0.5,
        },
      }),
    ).toBe(false);

    // Class B: equal cents cannot yield retained half 1.0 under friction mid (narrow scan may still)
    // Use a case known from diagnostic: 97/97 retained 1.0
    expect(
      isClassBReconstructionUncertain({
        yesBidCents: 97,
        yesAskCents: 97,
        halfSpreadMismatch: {
          retainedHalfSpreadCents: 1.0,
          regeneratedHalfSpreadCents: 0.0,
        },
      }),
    ).toBe(true);
  });

  it("builds CR2 two-sided CI with df = G−1 (not row-level SE)", () => {
    const days = ["d1", "d2", "d3", "d4"];
    const trades = days.flatMap((day, di) =>
      [0, 1, 2].map((j) => ({
        ...baseRow({
          utcDayKey: day,
          marketTicker: `${day}-M${j}`,
          entryTimestampMs: 1000 + di * 10 + j,
        }),
        settlementResult: "no" as const,
        entryFeeCents: 1,
        grossPnlCents: 10 + di,
        netPnlCents: 9 + di,
        labelCloseTime: null,
        labelSettlementTs: null,
        halfSpreadMismatchPresent: false,
        classBReconstructionUncertain: false,
        retainedEntryHalfSpreadCents: null,
        annualizedRealizedVolatility: 0.8,
        closeTimeMs: null,
        timeRemainingMs: 500_000,
        yesBidCents: 40,
        yesAskCents: 42,
        yesMidpoint: 0.41,
        noAskCents: 60,
        yesBidSize: 1,
        yesAskSize: 1,
      }))
    );
    // Fix required SelectedEntry fields already spread — cast via compute
    const inference = computeCr2TwoSidedMeanInference(trades as never);
    expect(inference.g).toBe(4);
    expect(inference.degreesOfFreedom).toBe(3);
    expect(inference.workingModel).toContain("CR2");
    expect(inference.workingModel).not.toMatch(/row-level SE as clustered/i);
    expect(inference.ci95LowerCents).toBeLessThan(inference.sampleMeanCents);
    expect(inference.ci95UpperCents).toBeGreaterThan(inference.sampleMeanCents);
    expect(studentTCriticalTwoSided95(3)).toBeGreaterThan(2);
  });

  it("applies predeclared exploratory interpretation rules", () => {
    expect(
      interpretExploratoryResult({
        dataIntegrityOk: true,
        n: 40,
        g: 12,
        meanNetPnlCents: 5,
        inference: null,
      }).status,
    ).toBe("insufficient-evidence");

    expect(
      interpretExploratoryResult({
        dataIntegrityOk: true,
        n: 100,
        g: 20,
        meanNetPnlCents: -2,
        inference: {
          method: "x",
          n: 100,
          g: 20,
          degreesOfFreedom: 19,
          sampleMeanCents: -2,
          cr2StandardError: 1,
          tStatistic: -2,
          tCriticalTwoSided95: 2.1,
          ci95LowerCents: -4.1,
          ci95UpperCents: 0.1,
          workingModel: "x",
        },
      }).status,
    ).toBe("observed-economics-do-not-support-proceeding");

    expect(
      interpretExploratoryResult({
        dataIntegrityOk: true,
        n: 100,
        g: 20,
        meanNetPnlCents: -2,
        inference: {
          method: "x",
          n: 100,
          g: 20,
          degreesOfFreedom: 19,
          sampleMeanCents: -2,
          cr2StandardError: 0.5,
          tStatistic: -4,
          tCriticalTwoSided95: 2.1,
          ci95LowerCents: -3.05,
          ci95UpperCents: -0.95,
          workingModel: "x",
        },
      }).status,
    ).toBe("evidence-against-positive-mean");
  });

  it("runs an end-to-end fixture study without synthetic P&L substitution claims", () => {
    const features: PreentryFeatureRow[] = [];
    for (let d = 0; d < 12; d += 1) {
      for (let m = 0; m < 5; m += 1) {
        features.push(
          baseRow({
            utcDayKey: `2026-08-${String(14 + d).padStart(2, "0")}`,
            marketTicker: `M-${d}-${m}`,
            entryTimestampMs: 1_000_000 + d * 1000 + m,
            noAskCents: 55,
            yesBidCents: 45,
            yesAskCents: 46,
            yesMidpoint: 0.455,
          }),
        );
      }
    }
    const labels = features.map((f) => ({
      marketTicker: f.marketTicker,
      result: (f.entryTimestampMs % 2 === 0 ? "no" : "yes") as string,
    }));
    const out = runCalibrationFadeV2SpentGridHtsStudy({
      generatedAtUtc: "2026-09-26T00:00:00.000Z",
      codeAuthoritySha: "test",
      inputHashesVerified: true,
      features,
      labels,
      sealedCalibrationFadeArtifactsPresent: false,
    });
    expect(out.report.attestation.simulatedPnlAtObservedQuotes).toBe(true);
    expect(out.report.coverage.selectedMarkets).toBe(60);
    expect(out.report.economics.n).toBe(60);
    expect(out.report.economics.g).toBe(12);
    expect(out.report.coverage.selectedWithHalfSpreadMismatch).toBe(0);
  });
});
