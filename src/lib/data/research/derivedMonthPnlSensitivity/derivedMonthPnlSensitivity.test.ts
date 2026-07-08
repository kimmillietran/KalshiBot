import { describe, expect, it } from "vitest";

import { buildDerivedMonthPnlSensitivityReport } from "./buildDerivedMonthPnlSensitivityReport";
import { createDerivedMonthPnlSensitivityConfig } from "./derivedMonthPnlSensitivityConfig";
import {
  buildVariantMetrics,
  computeVariantDelta,
  evaluateFamilyRecommendation,
  filterTradesForVariant,
  isTradeInSensitiveMonth,
} from "./derivedMonthPnlSensitivityMath";
import {
  serializeDerivedMonthPnlSensitivityHtml,
  serializeDerivedMonthPnlSensitivityReport,
} from "./serializeDerivedMonthPnlSensitivity";
import type { PnlForensicsFilledTrade } from "@/lib/data/research/pnlForensicsGate";

function createTrade(input: {
  hypothesisId: string;
  calendarMonth: string;
  tradingDayUtc: string;
  marketTicker: string;
  netPnlCents: number;
  sideBucket?: PnlForensicsFilledTrade["sideBucket"];
}): PnlForensicsFilledTrade {
  return {
    hypothesisId: input.hypothesisId,
    suggestedStrategyFamily: "calibration-fade",
    sideBucket: input.sideBucket ?? "calibration-no-fade",
    contractSide: "no",
    marketTicker: input.marketTicker,
    marketId: `strategy:${input.marketTicker}`,
    tradingDayUtc: input.tradingDayUtc,
    calendarMonth: input.calendarMonth,
    grossPnlCents: input.netPnlCents + 1,
    netPnlCents: input.netPnlCents,
    entryPriceCents: 40,
    feeCents: 1,
    volatilityRegime: null,
    trendRegime: null,
    marketState: null,
  };
}

const config = createDerivedMonthPnlSensitivityConfig({
  sensitiveMonth: "2025-12",
  excludeMonth: "2025-12",
});

describe("filterTradesForVariant", () => {
  const trades = [
    createTrade({
      hypothesisId: "h1",
      calendarMonth: "2025-11",
      tradingDayUtc: "2025-11-01",
      marketTicker: "m1",
      netPnlCents: 100,
    }),
    createTrade({
      hypothesisId: "h1",
      calendarMonth: "2025-12",
      tradingDayUtc: "2025-12-01",
      marketTicker: "m2",
      netPnlCents: 500,
    }),
    createTrade({
      hypothesisId: "h2",
      calendarMonth: "2025-10",
      tradingDayUtc: "2025-10-01",
      marketTicker: "m3",
      netPnlCents: 50,
    }),
  ];

  it("keeps all trades for full corpus", () => {
    const filtered = filterTradesForVariant({
      trades,
      variantId: "full-corpus",
      config,
      derivedMarketKeys: new Set(),
      usesSensitiveMonthHeuristic: true,
    });
    expect(filtered).toHaveLength(3);
  });

  it("excludes sensitive month trades", () => {
    const filtered = filterTradesForVariant({
      trades,
      variantId: "excluding-sensitive-month",
      config,
      derivedMarketKeys: new Set(),
      usesSensitiveMonthHeuristic: true,
    });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((trade) => trade.calendarMonth !== "2025-12")).toBe(true);
  });

  it("keeps only sensitive month trades", () => {
    const filtered = filterTradesForVariant({
      trades,
      variantId: "sensitive-month-only",
      config,
      derivedMarketKeys: new Set(),
      usesSensitiveMonthHeuristic: true,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.calendarMonth).toBe("2025-12");
  });

  it("uses market keys for official-only when available", () => {
    const filtered = filterTradesForVariant({
      trades,
      variantId: "official-only",
      config,
      derivedMarketKeys: new Set(["strategy/SERIES/m2"]),
      usesSensitiveMonthHeuristic: false,
    });
    expect(filtered.map((trade) => trade.marketTicker)).toEqual(["m1", "m3"]);
  });
});

describe("variant metrics and deltas", () => {
  it("computes positive PnL survival after exclusion", () => {
    const trades = [
      createTrade({
        hypothesisId: "h1",
        calendarMonth: "2025-11",
        tradingDayUtc: "2025-11-01",
        marketTicker: "m1",
        netPnlCents: 200,
      }),
      createTrade({
        hypothesisId: "h1",
        calendarMonth: "2025-10",
        tradingDayUtc: "2025-10-01",
        marketTicker: "m2",
        netPnlCents: 150,
      }),
      createTrade({
        hypothesisId: "h2",
        calendarMonth: "2025-12",
        tradingDayUtc: "2025-12-01",
        marketTicker: "m3",
        netPnlCents: 300,
      }),
    ];

    const full = buildVariantMetrics({
      variantId: "full-corpus",
      label: "Full",
      filterDescription: "all",
      trades,
      config,
      sensitiveMonth: "2025-12",
    });
    const excluded = buildVariantMetrics({
      variantId: "excluding-sensitive-month",
      label: "Excluding",
      filterDescription: "exclude",
      trades: filterTradesForVariant({
        trades,
        variantId: "excluding-sensitive-month",
        config,
        derivedMarketKeys: new Set(),
        usesSensitiveMonthHeuristic: true,
      }),
      config,
      sensitiveMonth: "2025-12",
    });

    expect(full.netPnlCents).toBe(650);
    expect(excluded.netPnlCents).toBe(350);
    expect(excluded.netPnlCents).toBeGreaterThan(0);

    const delta = computeVariantDelta({ fullCorpus: full, variant: excluded });
    expect(delta.netPnlRetentionShare).toBeCloseTo(350 / 650, 4);
  });

  it("detects PnL collapse after exclusion", () => {
    const trades = [
      createTrade({
        hypothesisId: "h1",
        calendarMonth: "2025-12",
        tradingDayUtc: "2025-12-01",
        marketTicker: "m1",
        netPnlCents: 400,
      }),
      createTrade({
        hypothesisId: "h2",
        calendarMonth: "2025-11",
        tradingDayUtc: "2025-11-01",
        marketTicker: "m2",
        netPnlCents: -20,
      }),
    ];

    const full = buildVariantMetrics({
      variantId: "full-corpus",
      label: "Full",
      filterDescription: "all",
      trades,
      config,
      sensitiveMonth: "2025-12",
    });
    const excluded = buildVariantMetrics({
      variantId: "excluding-sensitive-month",
      label: "Excluding",
      filterDescription: "exclude",
      trades: filterTradesForVariant({
        trades,
        variantId: "excluding-sensitive-month",
        config,
        derivedMarketKeys: new Set(),
        usesSensitiveMonthHeuristic: true,
      }),
      config,
      sensitiveMonth: "2025-12",
    });

    expect(excluded.netPnlCents).toBeLessThanOrEqual(0);
    expect(
      evaluateFamilyRecommendation({
        config,
        fullCorpus: full,
        excludingSensitiveMonth: excluded,
        sensitiveMonthOnly: buildVariantMetrics({
          variantId: "sensitive-month-only",
          label: "Dec",
          filterDescription: "dec",
          trades: filterTradesForVariant({
            trades,
            variantId: "sensitive-month-only",
            config,
            derivedMarketKeys: new Set(),
            usesSensitiveMonthHeuristic: true,
          }),
          config,
          sensitiveMonth: "2025-12",
        }),
        excludingDelta: computeVariantDelta({ fullCorpus: full, variant: excluded }),
      }),
    ).toBe("reject-family-derived-month-artifact");
  });

  it("detects hypothesis sign flips", () => {
    const trades = [
      createTrade({
        hypothesisId: "h-pos",
        calendarMonth: "2025-12",
        tradingDayUtc: "2025-12-01",
        marketTicker: "m1",
        netPnlCents: 200,
      }),
      createTrade({
        hypothesisId: "h-pos",
        calendarMonth: "2025-11",
        tradingDayUtc: "2025-11-01",
        marketTicker: "m2",
        netPnlCents: -50,
      }),
    ];

    const full = buildVariantMetrics({
      variantId: "full-corpus",
      label: "Full",
      filterDescription: "all",
      trades,
      config,
      sensitiveMonth: "2025-12",
    });
    const excluded = buildVariantMetrics({
      variantId: "excluding-sensitive-month",
      label: "Excluding",
      filterDescription: "exclude",
      trades: filterTradesForVariant({
        trades,
        variantId: "excluding-sensitive-month",
        config,
        derivedMarketKeys: new Set(),
        usesSensitiveMonthHeuristic: true,
      }),
      config,
      sensitiveMonth: "2025-12",
    });
    const delta = computeVariantDelta({ fullCorpus: full, variant: excluded });

    expect(delta.hypothesisSignFlips).toBe(1);
    expect(delta.flippedHypothesisIds).toEqual(["h-pos"]);
  });

  it("detects side sign flips", () => {
    const trades = [
      createTrade({
        hypothesisId: "h1",
        calendarMonth: "2025-12",
        tradingDayUtc: "2025-12-01",
        marketTicker: "m1",
        netPnlCents: 80,
        sideBucket: "calibration-yes-fade",
      }),
      createTrade({
        hypothesisId: "h1",
        calendarMonth: "2025-11",
        tradingDayUtc: "2025-11-01",
        marketTicker: "m2",
        netPnlCents: -90,
        sideBucket: "calibration-no-fade",
      }),
    ];

    const full = buildVariantMetrics({
      variantId: "full-corpus",
      label: "Full",
      filterDescription: "all",
      trades,
      config,
      sensitiveMonth: "2025-12",
    });
    const excluded = buildVariantMetrics({
      variantId: "excluding-sensitive-month",
      label: "Excluding",
      filterDescription: "exclude",
      trades: filterTradesForVariant({
        trades,
        variantId: "excluding-sensitive-month",
        config,
        derivedMarketKeys: new Set(),
        usesSensitiveMonthHeuristic: true,
      }),
      config,
      sensitiveMonth: "2025-12",
    });
    const delta = computeVariantDelta({ fullCorpus: full, variant: excluded });

    expect(delta.sideSignFlips).toBeGreaterThan(0);
  });
});

describe("buildDerivedMonthPnlSensitivityReport", () => {
  it("emits sensitive-month heuristic warning when market keys missing", () => {
    const trades = [
      createTrade({
        hypothesisId: "h1",
        calendarMonth: "2025-11",
        tradingDayUtc: "2025-11-01",
        marketTicker: "m1",
        netPnlCents: 100,
      }),
    ];

    const report = buildDerivedMonthPnlSensitivityReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      inputPaths: buildDefaultPaths(),
      inputStatus: {
        hypothesisTradeReplayPresent: true,
        pnlForensicsGatePresent: true,
        hypothesisCandidatesPresent: true,
        hypothesisValidationPresent: false,
        oosPowerCorrectionPresent: false,
        calibrationFadeFamilyVerdictPresent: false,
        derivedSettlementSensitivityPresent: false,
        regimeTagsPresent: false,
        derivedMarketKeysDiscovered: false,
        usesSensitiveMonthHeuristic: true,
      },
      config,
      loadedInputs: {
        trades,
        derivedMarketKeys: new Set(),
        usesSensitiveMonthHeuristic: true,
        m11Summary: null,
      },
    });

    expect(report.inputStatus.usesSensitiveMonthHeuristic).toBe(true);
    expect(report.warnings.some((warning) => warning.includes("heuristic"))).toBe(true);
    expect(report.variants.map((variant) => variant.variantId)).toEqual([
      "full-corpus",
      "excluding-sensitive-month",
      "sensitive-month-only",
      "official-only",
      "derived-only",
    ]);
  });

  it("serializes deterministic JSON and consistent HTML", () => {
    const trades = [
      createTrade({
        hypothesisId: "h1",
        calendarMonth: "2025-11",
        tradingDayUtc: "2025-11-01",
        marketTicker: "m1",
        netPnlCents: 100,
      }),
    ];

    const report = buildDerivedMonthPnlSensitivityReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      inputPaths: buildDefaultPaths(),
      inputStatus: {
        hypothesisTradeReplayPresent: true,
        pnlForensicsGatePresent: true,
        hypothesisCandidatesPresent: true,
        hypothesisValidationPresent: false,
        oosPowerCorrectionPresent: false,
        calibrationFadeFamilyVerdictPresent: false,
        derivedSettlementSensitivityPresent: false,
        regimeTagsPresent: false,
        derivedMarketKeysDiscovered: false,
        usesSensitiveMonthHeuristic: true,
      },
      config,
      loadedInputs: {
        trades,
        derivedMarketKeys: new Set(),
        usesSensitiveMonthHeuristic: true,
        m11Summary: null,
      },
    });

    const json = JSON.parse(serializeDerivedMonthPnlSensitivityReport(report));
    const html = serializeDerivedMonthPnlSensitivityHtml(report);

    expect(json.summary.fullCorpusNetPnlCents).toBe(100);
    expect(html).toContain("Derived-Month PnL Sensitivity");
    expect(html).toContain(json.summary.familyRecommendation);
  });
});

describe("isTradeInSensitiveMonth", () => {
  it("matches calendar month exactly", () => {
    const trade = createTrade({
      hypothesisId: "h1",
      calendarMonth: "2025-12",
      tradingDayUtc: "2025-12-01",
      marketTicker: "m1",
      netPnlCents: 1,
    });
    expect(isTradeInSensitiveMonth(trade, "2025-12")).toBe(true);
    expect(isTradeInSensitiveMonth(trade, "2025-11")).toBe(false);
  });
});

function buildDefaultPaths() {
  return {
    hypothesisTradeReplayPath: "data/research-results/hypothesis-trade-replay.json",
    pnlForensicsGatePath: "data/research-results/pnl-forensics-gate.json",
    hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
    hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
    oosPowerCorrectionPath: "data/research-results/oos-power-correction.json",
    calibrationFadeFamilyVerdictPath:
      "data/research-results/calibration-fade-family-verdict.json",
    derivedSettlementSensitivityPath:
      "data/research-results/derived-settlement-sensitivity.json",
    regimeTagsPath: "data/research-results/regime-tags.json",
    researchResultsDir: "data/research-results",
  };
}
