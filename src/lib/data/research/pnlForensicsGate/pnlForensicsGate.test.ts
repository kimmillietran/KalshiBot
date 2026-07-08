import { describe, expect, it } from "vitest";

import { buildPnlForensicsGateReport } from "./buildPnlForensicsGateReport";
import { buildRegimeTagLookupFromArtifact } from "./extractFilledTrades";
import { loadHypothesisTradeReplayReport } from "./loadPnlForensicsGateInputs";
import { createPnlForensicsGateConfig } from "./pnlForensicsGateConfig";
import {
  serializePnlForensicsGateHtml,
  serializePnlForensicsGateReport,
} from "./serializePnlForensicsGate";
import { PnlForensicsGateError } from "./pnlForensicsGateTypes";

const TRADE_REPLAY_FIXTURE = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  outputPath: "data/research-results/hypothesis-trade-replay.json",
  htmlOutputPath: "data/reports/hypothesis-trade-replay.html",
  disclaimer: "fixture",
  config: {
    executionMode: "cross-spread",
    maxSpreadCents: 10,
    minNetEdgeCents: 0,
    slippageBufferCents: 0,
    officialOnly: true,
    feeModel: { kind: "kalshi-fee-schedule", role: "taker", schedule: "standard" },
  },
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
    costAwareAtlasPresent: true,
  },
  summary: {
    replayedHypothesisCount: 1,
    evaluatedTradeCount: 3,
    filledTradeCount: 3,
    skippedTradeCount: 0,
    positiveNetHypothesisCount: 1,
    killedByCostOrFillabilityCount: 0,
    untradeableHypothesisCount: 0,
    descriptiveButUnprofitableCount: 0,
  },
  entries: [
    {
      hypothesisId: "atlas-test-over",
      hypothesis: "test",
      sourceArtifact: "mispricing-atlas.json",
      tradeRule: {
        side: "no",
        calibrationDirection: "over",
        rationale: "fade",
      },
      unsupportedReason: null,
      metrics: {
        tradeCount: 3,
        fillableObservationCount: 3,
        skippedCount: 0,
        skipReasons: {
          "missing-quote": 0,
          "invalid-quote": 0,
          "wide-spread": 0,
          "insufficient-net-edge": 0,
          "unsupported-hypothesis-type": 0,
          "no-bucket-observations": 0,
        },
        uniqueMarketCount: 2,
        uniqueTradingDayCount: 2,
        averageTradesPerMarket: 1.5,
        maxTradesPerMarket: 2,
        grossPnlCents: 60,
        netPnlCents: 50,
        averagePnlCentsPerTrade: 16.67,
        winRate: 0.67,
        maxDrawdownCents: 10,
        exposureCount: 3,
        averageEntryPriceCents: 30,
        averageSpreadPaidCents: 2,
        averageFeeCents: 1,
        realizedRoi: 0.5,
        calibrationGapCents: 55,
        calibrationGapVsRealizedPnlDeltaCents: -5,
      },
      warnings: [],
      candidate: {
        candidateId: "atlas-test-over",
        confidence: "medium",
        suggestedStrategyFamily: "calibration-no-fade",
        bucketMetadata: {
          bucketId: "prob-5",
          bucketLabel: "[0.5, 0.6)",
          calibrationDirection: "over",
          calibrationError: 0.05,
          groupId: "probability",
          observations: 30,
          uniqueTradingDays: 5,
        },
      },
    },
  ],
};

describe("loadHypothesisTradeReplayReport", () => {
  it("rejects malformed replay artifacts", () => {
    expect(() =>
      loadHypothesisTradeReplayReport(
        {
          fileExists: () => true,
          readFile: () => "{not-json",
        },
        "bad.json",
      ),
    ).toThrow(PnlForensicsGateError);
  });

  it("rejects missing replay file", () => {
    expect(() =>
      loadHypothesisTradeReplayReport(
        {
          fileExists: () => false,
          readFile: () => "",
        },
        "missing.json",
      ),
    ).toThrow(PnlForensicsGateError);
  });
});

describe("buildPnlForensicsGateReport", () => {
  it("builds report with empty trades when replay cannot be re-derived", () => {
    const report = buildPnlForensicsGateReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      inputPaths: {
        hypothesisTradeReplayPath: "replay.json",
        hypothesisCandidatesPath: "candidates.json",
        hypothesisValidationPath: "validation.json",
        oosPowerCorrectionPath: "oos.json",
        calibrationFadeFamilyVerdictPath: "verdict.json",
        regimeTagsPath: "regime.json",
        monthRegimeAnalysisPath: "month.json",
      },
      inputStatus: {
        hypothesisTradeReplayPresent: true,
        hypothesisCandidatesPresent: false,
        hypothesisValidationPresent: false,
        oosPowerCorrectionPresent: false,
        calibrationFadeFamilyVerdictPresent: false,
        regimeTagsPresent: false,
        monthRegimeAnalysisPresent: false,
      },
      config: createPnlForensicsGateConfig(),
      loadedInputs: {
        tradeReplay: TRADE_REPLAY_FIXTURE as never,
        candidates: [],
        observations: [],
        regimeVolatilityByMarket: new Map(),
        regimeTags: new Map(),
        optionalArtifacts: {
          hypothesisValidation: null,
          oosPowerCorrection: null,
          calibrationFadeFamilyVerdict: null,
          monthRegimeAnalysis: null,
        },
      },
    });

    expect(report.summary.filledTradeCount).toBe(0);
    expect(report.summary.familyForensicsVerdict).toBe("insufficient-data");
    expect(report.summary.regimeBreakdownAvailable).toBe(false);
  });

  it("keeps JSON and HTML consistent", () => {
    const report = buildPnlForensicsGateReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      inputPaths: {
        hypothesisTradeReplayPath: "replay.json",
        hypothesisCandidatesPath: "candidates.json",
        hypothesisValidationPath: "validation.json",
        oosPowerCorrectionPath: "oos.json",
        calibrationFadeFamilyVerdictPath: "verdict.json",
        regimeTagsPath: "regime.json",
        monthRegimeAnalysisPath: "month.json",
      },
      inputStatus: {
        hypothesisTradeReplayPresent: true,
        hypothesisCandidatesPresent: true,
        hypothesisValidationPresent: false,
        oosPowerCorrectionPresent: false,
        calibrationFadeFamilyVerdictPresent: false,
        regimeTagsPresent: false,
        monthRegimeAnalysisPresent: false,
      },
      config: createPnlForensicsGateConfig(),
      loadedInputs: {
        tradeReplay: TRADE_REPLAY_FIXTURE as never,
        candidates: [],
        observations: [],
        regimeVolatilityByMarket: new Map(),
        regimeTags: new Map(),
        optionalArtifacts: {
          hypothesisValidation: null,
          oosPowerCorrection: null,
          calibrationFadeFamilyVerdict: null,
          monthRegimeAnalysis: null,
        },
      },
    });

    const json = JSON.parse(serializePnlForensicsGateReport(report));
    const html = serializePnlForensicsGateHtml(report);

    expect(json.summary.familyForensicsVerdict).toBe(report.summary.familyForensicsVerdict);
    expect(html).toContain(report.summary.familyForensicsVerdict);
    expect(html).toContain("not out-of-sample evidence");
  });
});

describe("buildRegimeTagLookupFromArtifact", () => {
  it("returns empty lookup when regime artifact is missing", () => {
    expect(buildRegimeTagLookupFromArtifact(null).size).toBe(0);
  });
});
