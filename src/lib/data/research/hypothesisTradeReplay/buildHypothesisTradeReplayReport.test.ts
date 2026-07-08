import { describe, expect, it } from "vitest";

import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { ReplayableObservation } from "./hypothesisTradeReplayTypes";
import { buildHypothesisTradeReplayReport } from "./buildHypothesisTradeReplayReport";
import { replayObservationTrade } from "./replayHypothesisTrades";

const GENERATED_AT = "2026-07-08T12:00:00.000Z";

const defaultConfig = {
  executionMode: "cross-spread" as const,
  maxSpreadCents: 10,
  minNetEdgeCents: 0,
  slippageBufferCents: 0,
  officialOnly: false,
  feeModel: { kind: "zero" as const },
};

function createCandidate(
  candidateId: string,
  overrides: Partial<HypothesisCandidate> = {},
): HypothesisCandidate {
  const isOver = candidateId.endsWith("-over");
  return {
    candidateId,
    sourceArtifact: "mispricing-atlas.json",
    hypothesis: "Test hypothesis",
    rationale: "Test rationale",
    marketCondition: "Test condition",
    suggestedStrategyFamily: isOver ? "calibration-no-fade" : "calibration-yes-fade",
    requiredData: ["research-output.json"],
    proposedEntryCondition: "Enter when edge exceeds threshold",
    proposedExitSettlementAssumption: "Hold to settlement",
    expectedFailureMode: "Regime shift",
    killCriterion: "Edge disappears",
    confidence: "medium",
    warnings: [],
    bucketMetadata: {
      groupId: "probabilityOnly",
      bucketId: "coarse-prob-3",
      bucketLabel: "[0.7, 0.9)",
      observations: 100,
      uniqueTradingDays: 10,
      calibrationError: isOver ? 0.08 : -0.08,
      calibrationDirection: isOver ? "over" : "under",
    },
    ...overrides,
  };
}

function createObservation(
  overrides: Partial<ReplayableObservation> = {},
): ReplayableObservation {
  return {
    strategyId: "noop",
    seriesTicker: "KXBTC15M",
    marketTicker: "KXBTC15M-MARKET-A",
    outputPath: "data/research-results/noop/KXBTC15M/KXBTC15M-MARKET-A/research-output.json",
    stepIndex: 0,
    predictedProbability: 0.75,
    observedOutcome: 0,
    timeRemainingMs: 900_000,
    moneynessPercent: 0,
    annualizedVolatility: 0.8,
    timestampMs: 1_700_000_000_000,
    tradingDayUtc: "2023-10-01",
    calendarMonth: "2023-10",
    calendarQuarter: "2023-Q4",
    volatilityRegime: "medium",
    quote: {
      yesBidCents: 73,
      yesAskCents: 77,
      noBidCents: 23,
      noAskCents: 27,
    },
    ...overrides,
  };
}

describe("replayObservationTrade", () => {
  it("skips when quote is missing", () => {
    const attempt = replayObservationTrade({
      observation: createObservation({ quote: null }),
      rule: { side: "no", calibrationDirection: "over", rationale: "fade" },
      config: defaultConfig,
      calibrationError: 0.08,
    });

    expect(attempt.status).toBe("skipped");
    expect(attempt.skipReason).toBe("missing-quote");
  });

  it("skips wide spreads when filter enabled", () => {
    const attempt = replayObservationTrade({
      observation: createObservation({
        quote: {
          yesBidCents: 60,
          yesAskCents: 80,
          noBidCents: 20,
          noAskCents: 40,
        },
      }),
      rule: { side: "no", calibrationDirection: "over", rationale: "fade" },
      config: { ...defaultConfig, maxSpreadCents: 5 },
      calibrationError: 0.08,
    });

    expect(attempt.status).toBe("skipped");
    expect(attempt.skipReason).toBe("wide-spread");
  });

  it("reduces net PnL with fees", () => {
    const withoutFees = replayObservationTrade({
      observation: createObservation({ observedOutcome: 0 }),
      rule: { side: "no", calibrationDirection: "over", rationale: "fade" },
      config: defaultConfig,
      calibrationError: 0.08,
    });
    const withFees = replayObservationTrade({
      observation: createObservation({ observedOutcome: 0 }),
      rule: { side: "no", calibrationDirection: "over", rationale: "fade" },
      config: {
        ...defaultConfig,
        feeModel: { kind: "per-contract-fee", feeCentsPerContract: 2 },
      },
      calibrationError: 0.08,
    });

    expect(withoutFees.netPnlCents).toBe(73);
    expect(withFees.netPnlCents).toBe(71);
    expect(withFees.feeCents).toBe(2);
  });

  it("computes hold-to-settlement payout for winning NO fade", () => {
    const attempt = replayObservationTrade({
      observation: createObservation({ observedOutcome: 0 }),
      rule: { side: "no", calibrationDirection: "over", rationale: "fade" },
      config: defaultConfig,
      calibrationError: 0.08,
    });

    expect(attempt.status).toBe("filled");
    expect(attempt.entryPriceCents).toBe(27);
    expect(attempt.grossPnlCents).toBe(73);
    expect(attempt.netPnlCents).toBe(73);
  });

  it("computes hold-to-settlement payout for losing NO fade", () => {
    const attempt = replayObservationTrade({
      observation: createObservation({ observedOutcome: 1 }),
      rule: { side: "no", calibrationDirection: "over", rationale: "fade" },
      config: defaultConfig,
      calibrationError: 0.08,
    });

    expect(attempt.grossPnlCents).toBe(-27);
  });

  it("computes hold-to-settlement payout for winning YES fade", () => {
    const attempt = replayObservationTrade({
      observation: createObservation({ observedOutcome: 1 }),
      rule: { side: "yes", calibrationDirection: "under", rationale: "fade" },
      config: defaultConfig,
      calibrationError: -0.08,
    });

    expect(attempt.status).toBe("filled");
    expect(attempt.entryPriceCents).toBe(77);
    expect(attempt.grossPnlCents).toBe(23);
  });
});

describe("buildHypothesisTradeReplayReport", () => {
  const baseInput = {
    generatedAt: GENERATED_AT,
    outputPath: "data/research-results/hypothesis-trade-replay.json",
    htmlOutputPath: "data/reports/hypothesis-trade-replay.html",
    inputPaths: {
      hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
      mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
      costAwareAtlasPath: "data/research-results/cost-aware-atlas.json",
      researchResultsDir: "data/research-results",
      regimeTagsPath: "data/research-results/regime-tags.json",
    },
    inputStatus: {
      hypothesisCandidatesPresent: true,
      mispricingAtlasPresent: true,
      costAwareAtlasPresent: false,
    },
    config: defaultConfig,
    regimeVolatilityByMarket: new Map(),
  };

  it("reports repeated entries in the same market as dependent trades", () => {
    const report = buildHypothesisTradeReplayReport({
      ...baseInput,
      candidates: [createCandidate("atlas-probabilityOnly-coarse-prob-3-over")],
      observations: [
        createObservation({ stepIndex: 0, observedOutcome: 0 }),
        createObservation({ stepIndex: 1, observedOutcome: 1 }),
        createObservation({ stepIndex: 2, observedOutcome: 0 }),
      ],
    });

    expect(report.entries[0]?.metrics.tradeCount).toBe(3);
    expect(report.entries[0]?.metrics.uniqueMarketCount).toBe(1);
    expect(report.entries[0]?.metrics.maxTradesPerMarket).toBe(3);
    expect(report.entries[0]?.warnings.some((warning) => warning.includes("temporally dependent"))).toBe(
      true,
    );
  });

  it("returns deterministic replay output", () => {
    const observations = [
      createObservation({ stepIndex: 0, observedOutcome: 0 }),
      createObservation({ stepIndex: 1, observedOutcome: 1, marketTicker: "KXBTC15M-MARKET-B" }),
    ];

    const first = buildHypothesisTradeReplayReport({
      ...baseInput,
      candidates: [createCandidate("atlas-probabilityOnly-coarse-prob-3-over")],
      observations,
    });
    const second = buildHypothesisTradeReplayReport({
      ...baseInput,
      candidates: [createCandidate("atlas-probabilityOnly-coarse-prob-3-over")],
      observations,
    });

    expect(first).toEqual(second);
    expect(first.entries[0]?.metrics.tradeCount).toBe(2);
    expect(first.summary.filledTradeCount).toBe(2);
  });

  it("handles empty hypotheses input", () => {
    const report = buildHypothesisTradeReplayReport({
      ...baseInput,
      candidates: [],
      observations: [createObservation()],
    });

    expect(report.summary.replayedHypothesisCount).toBe(0);
    expect(report.entries).toEqual([]);
  });

  it("handles no matching observations", () => {
    const report = buildHypothesisTradeReplayReport({
      ...baseInput,
      candidates: [createCandidate("atlas-probabilityOnly-coarse-prob-3-over")],
      observations: [
        createObservation({ predictedProbability: 0.2 }),
      ],
    });

    expect(report.entries[0]?.metrics.tradeCount).toBe(0);
    expect(report.entries[0]?.metrics.skipReasons["no-bucket-observations"]).toBe(1);
  });

  it("marks all trades skipped when spread filter blocks fills", () => {
    const report = buildHypothesisTradeReplayReport({
      ...baseInput,
      config: { ...defaultConfig, maxSpreadCents: 1 },
      candidates: [createCandidate("atlas-probabilityOnly-coarse-prob-3-over")],
      observations: [createObservation()],
    });

    expect(report.entries[0]?.metrics.tradeCount).toBe(0);
    expect(report.entries[0]?.metrics.skippedCount).toBe(1);
    expect(report.summary.killedByCostOrFillabilityCount).toBe(1);
  });
});
