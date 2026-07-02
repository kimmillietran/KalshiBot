import { describe, expect, it } from "vitest";

import {
  buildProbabilityCalibrationReport,
  buildProbabilityCalibrationReportsFromScanned,
  serializeProbabilityCalibrationReport,
} from "./buildProbabilityCalibrationReport";
import {
  CalibrationError,
  CalibrationErrorCode,
} from "./calibrationTypes";
import { scanCalibrationResearchOutputs } from "./scanCalibrationResearchOutputs";
import { createRunnerResearchOutputJson } from "./testFixtures";
import { parseCalibrationResearchDocument } from "./parseCalibrationResearchOutput";

const STRATEGY_ID = "noop";
const SERIES_TICKER = "KXBTC15M";
const MARKET_A = `${SERIES_TICKER}-MARKET-A`;
const MARKET_B = `${SERIES_TICKER}-MARKET-B`;

function createScanned(
  marketTicker: string,
  outputJson: string,
  outputPath?: string,
) {
  return {
    strategyId: STRATEGY_ID,
    seriesTicker: SERIES_TICKER,
    marketTicker,
    outputPath:
      outputPath
      ?? `data/research-results/${STRATEGY_ID}/${SERIES_TICKER}/${marketTicker}/research-output.json`,
    outputJson,
  };
}

describe("buildProbabilityCalibrationReport", () => {
  it("builds kalshi-implied and strategy fair-value channel metrics", () => {
    const report = buildProbabilityCalibrationReport({
      inputRoot: "data/research-results",
      outputRoot: "data/research-results",
      generatedAt: "2026-06-27T00:00:00.000Z",
      scanned: [
        createScanned(
          MARKET_A,
          createRunnerResearchOutputJson({
            strategyId: STRATEGY_ID,
            settlementResult: "yes",
            strategyProbabilityUp: 0.72,
          }),
        ),
        createScanned(
          MARKET_B,
          createRunnerResearchOutputJson({
            strategyId: STRATEGY_ID,
            marketTicker: MARKET_B,
            settlementResult: "no",
            kalshiCandles: [{ yesBidCents: 20, yesAskCents: 30 }],
            strategyProbabilityUp: 0.25,
          }),
        ),
      ],
    });

    expect(report.strategyId).toBe(STRATEGY_ID);
    expect(report.seriesTicker).toBe(SERIES_TICKER);
    expect(report.sampleCounts.marketCount).toBe(2);
    expect(report.sampleCounts.kalshiImpliedCount).toBe(3);
    expect(report.sampleCounts.strategyFairValueCount).toBe(2);
    expect(report.kalshiImplied.brierScore).not.toBeNull();
    expect(report.kalshiImplied.logLoss).not.toBeNull();
    expect(report.kalshiImplied.calibrationError).not.toBeNull();
    expect(report.kalshiImplied.reliabilityTable).toHaveLength(10);
    expect(report.strategyFairValue?.sampleCount).toBe(2);
    expect(report.outputPath).toBe(
      `data/research-results/${STRATEGY_ID}/${SERIES_TICKER}/calibration-report.json`,
    );
  });

  it("sorts markets and warnings deterministically", () => {
    const report = buildProbabilityCalibrationReport({
      inputRoot: "data/research-results",
      outputRoot: "data/research-results",
      generatedAt: "2026-06-27T00:00:00.000Z",
      scanned: [
        createScanned(
          MARKET_B,
          createRunnerResearchOutputJson({
            marketTicker: MARKET_B,
            settlementResult: "yes",
            strategyProbabilityUp: null,
          }),
        ),
        createScanned(
          MARKET_A,
          createRunnerResearchOutputJson({
            settlementResult: null,
            strategyProbabilityUp: 0.5,
          }),
        ),
      ],
    });

    expect(report.markets.map((market) => market.marketTicker)).toEqual([
      MARKET_A,
      MARKET_B,
    ]);
    expect(report.warnings.map((warning) => warning.marketTicker)).toEqual([
      MARKET_A,
      MARKET_B,
    ]);
    expect(serializeProbabilityCalibrationReport(report)).toBe(
      serializeProbabilityCalibrationReport(
        buildProbabilityCalibrationReport({
          inputRoot: "data/research-results",
          outputRoot: "data/research-results",
          generatedAt: "2026-06-27T00:00:00.000Z",
          scanned: [
            createScanned(
              MARKET_B,
              createRunnerResearchOutputJson({
                marketTicker: MARKET_B,
                settlementResult: "yes",
                strategyProbabilityUp: null,
              }),
            ),
            createScanned(
              MARKET_A,
              createRunnerResearchOutputJson({
                settlementResult: null,
                strategyProbabilityUp: 0.5,
              }),
            ),
          ],
        }),
      ),
    );
  });

  it("reads settlement from the final expanded candle-replay snapshot", () => {
    const snapshots = [
      {
        ticker: MARKET_A,
        marketWindow: { ticker: MARKET_A, seriesTicker: SERIES_TICKER },
        settlement: null,
        kalshiCandles: [{ yesBidCents: 40, yesAskCents: 60, ticker: MARKET_A }],
      },
      {
        ticker: MARKET_A,
        marketWindow: { ticker: MARKET_A, seriesTicker: SERIES_TICKER },
        settlement: { result: "no", ticker: MARKET_A },
        kalshiCandles: [
          { yesBidCents: 40, yesAskCents: 60, ticker: MARKET_A },
          { yesBidCents: 70, yesAskCents: 80, ticker: MARKET_A },
        ],
      },
    ];

    const outputJson = JSON.stringify({
      dataset: JSON.stringify({ snapshots }),
      researchRun: JSON.stringify({
        config: { strategyId: STRATEGY_ID },
        backtestResult: JSON.stringify({
          replayResult: {
            results: [{ engineOutput: { probability: { probabilityUp: 0.4 } } }],
          },
        }),
      }),
      metadata: { strategyId: STRATEGY_ID },
    });

    const parsed = parseCalibrationResearchDocument(
      outputJson,
      `data/research-results/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_A}/research-output.json`,
    );

    expect(parsed.settlementOutcome).toBe(0);
    expect(parsed.kalshiImpliedProbabilities).toHaveLength(2);
  });

  it("warns on missing settlement and missing strategy probability", () => {
    const report = buildProbabilityCalibrationReport({
      inputRoot: "data/research-results",
      outputRoot: "data/research-results",
      generatedAt: "2026-06-27T00:00:00.000Z",
      scanned: [
        createScanned(
          MARKET_A,
          createRunnerResearchOutputJson({
            settlementResult: null,
            strategyProbabilityUp: 0.5,
          }),
        ),
      ],
    });

    expect(report.sampleCounts.skippedMissingSettlement).toBe(1);
    expect(report.sampleCounts.totalObservations).toBe(0);
    expect(report.strategyFairValue).toBeNull();
    expect(report.warnings.some(
      (warning) => warning.code === CalibrationErrorCode.MISSING_SETTLEMENT,
    )).toBe(true);
  });

  it("throws for empty scanned datasets", () => {
    expect(() =>
      buildProbabilityCalibrationReport({
        inputRoot: "data/research-results",
        outputRoot: "data/research-results",
        generatedAt: "2026-06-27T00:00:00.000Z",
        scanned: [],
      }),
    ).toThrow(CalibrationError);
  });
});

describe("scanCalibrationResearchOutputs", () => {
  it("detects duplicate markets", () => {
    const outputJson = createRunnerResearchOutputJson();
    const outputPathA =
      `data/research-results/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_A}/research-output.json`;
    const outputPathB =
      `data/research-results/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_A}-dup/research-output.json`;

    expect(() =>
      scanCalibrationResearchOutputs("data/research-results", {
        readdir: (path) => {
          if (path === "data/research-results") {
            return [STRATEGY_ID];
          }
          if (path === `data/research-results/${STRATEGY_ID}`) {
            return [SERIES_TICKER];
          }
          if (path === `data/research-results/${STRATEGY_ID}/${SERIES_TICKER}`) {
            return [MARKET_A, `${MARKET_A}-dup`];
          }
          return [];
        },
        readFile: () => outputJson,
        fileExists: (path) => path === outputPathA || path === outputPathB,
        isDirectory: (path) =>
          path === "data/research-results"
          || path === `data/research-results/${STRATEGY_ID}`
          || path === `data/research-results/${STRATEGY_ID}/${SERIES_TICKER}`
          || path.endsWith(MARKET_A)
          || path.endsWith(`${MARKET_A}-dup`),
      }),
    ).toThrow(CalibrationError);
  });

  it("groups strategy and series reports deterministically", () => {
    const reports = buildProbabilityCalibrationReportsFromScanned(
      "data/research-results",
      "data/research-results",
      [
        createScanned(
          MARKET_B,
          createRunnerResearchOutputJson({ marketTicker: MARKET_B }),
        ),
        createScanned(MARKET_A, createRunnerResearchOutputJson()),
      ],
      { generatedAt: "2026-06-27T00:00:00.000Z" },
    );

    expect(reports).toHaveLength(1);
    expect(reports[0]?.markets.map((market) => market.marketTicker)).toEqual([
      MARKET_A,
      MARKET_B,
    ]);
  });
});
