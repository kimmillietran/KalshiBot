import { describe, expect, it } from "vitest";

import { buildValidationObservationAccumulators } from "./buildValidationObservationAccumulators";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

const INPUT_ROOT = "data/research-results";
const STRATEGY_ID = "noop";
const SERIES_TICKER = "KXBTC15M";
const MARKET_A = `${SERIES_TICKER}-MARKET-A`;

function createReplayResearchOutputJson(): string {
  return JSON.stringify({
    dataset: JSON.stringify({
      snapshots: [
        {
          ticker: MARKET_A,
          marketWindow: {
            ticker: MARKET_A,
            seriesTicker: SERIES_TICKER,
            strikePriceUsd: 60_000,
            closeTime: "2026-06-02T12:00:00.000Z",
          },
          settlement: {
            result: "yes",
            ticker: MARKET_A,
          },
        },
      ],
    }),
    researchRun: JSON.stringify({
      config: { strategyId: STRATEGY_ID },
      backtestResult: JSON.stringify({
        replayResult: {
          results: [
            {
              stepIndex: 0,
              engineInput: {
                evaluatedAt: "2026-06-02T11:00:00.000Z",
                pricing: { yesBidCents: 65, yesAskCents: 75 },
                market: {
                  strikePrice: 60_000,
                  timeRemainingMs: 12 * 60_000,
                },
                btc: {
                  price: 59_500,
                  candles: [
                    {
                      timestamp: 0,
                      open: 59_500,
                      high: 59_500,
                      low: 59_500,
                      close: 59_500,
                    },
                  ],
                },
              },
            },
          ],
        },
      }),
    }),
    metadata: { strategyId: STRATEGY_ID },
  });
}

function createCandidate(candidateId: string): HypothesisCandidate {
  return {
    candidateId,
    sourceArtifact: "mispricing-atlas.json",
    hypothesis: "Test hypothesis",
    rationale: "Test rationale",
    marketCondition: "Test condition",
    suggestedStrategyFamily: "calibration-fade",
    requiredData: [],
    proposedEntryCondition: "edge",
    proposedExitSettlementAssumption: "settlement",
    expectedFailureMode: "regime",
    killCriterion: "edge gone",
    confidence: "medium",
    warnings: [],
  };
}

describe("buildValidationObservationAccumulators", () => {
  it("scans each research output once and records memory diagnostics", () => {
    const json = createReplayResearchOutputJson();
    let readCount = 0;

    const index = buildValidationObservationAccumulators({
      candidates: [createCandidate("atlas-probabilityOnly-coarse-prob-3-over")],
      researchResultsDir: INPUT_ROOT,
      regimeTagsPath: `${INPUT_ROOT}/regime-tags.json`,
      io: {
        readFile: (path) => {
          readCount += 1;
          if (path.endsWith("research-output.json")) {
            return json;
          }
          if (path.endsWith("regime-tags.json")) {
            return JSON.stringify({ regimes: [] });
          }
          throw new Error(`unexpected read: ${path}`);
        },
        fileExists: (path) =>
          path.endsWith("research-output.json") || path.endsWith("regime-tags.json"),
        readdir: (path) => {
          if (path === INPUT_ROOT) {
            return [STRATEGY_ID];
          }
          if (path.endsWith(STRATEGY_ID)) {
            return [SERIES_TICKER];
          }
          if (path.endsWith(SERIES_TICKER)) {
            return [MARKET_A];
          }
          return [];
        },
        isDirectory: (path) =>
          path === INPUT_ROOT
          || path.endsWith(STRATEGY_ID)
          || path.endsWith(SERIES_TICKER)
          || path.endsWith(MARKET_A),
      },
      memoryReport: true,
    });

    expect(readCount).toBe(2);
    expect(index.memoryDiagnostics.researchOutputFilesScanned).toBe(1);
    expect(index.memoryDiagnostics.observationsProcessed).toBeGreaterThan(0);
    expect(index.memoryDiagnostics.largestIntermediateCollection).toBe(
      "validation-bucket-accumulators",
    );
  });
});
