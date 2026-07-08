import { describe, expect, it } from "vitest";

import { extractDimensionValue } from "@/lib/data/research/dimensions/extractors";
import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

import { computeResearchObservationMomentumPercent } from "@/lib/data/research/dimensions/momentum/computeResearchObservationMomentumPercent";

import { extractMispricingObservationsFromResearchOutput } from "./parseMispricingObservations";
import {
  applyComputedFeaturesToObservationFields,
  enrichResearchObservationFeatures,
} from "./enrichResearchObservationFeatures";
import type { MispricingObservation } from "./mispricingAtlasTypes";

function buildCandles(closes: readonly number[]): EvaluationCandleSnapshot[] {
  return closes.map((close, index) => ({
    timestamp: index * 60_000,
    open: close,
    high: close,
    low: close,
    close,
  }));
}

function assertTopLevelMatchesComputedFeatures(observation: MispricingObservation): void {
  const features = observation.computedFeatures;
  expect(features).toBeDefined();
  if (!features) {
    return;
  }

  expect(observation.timeRemainingMs).toBe(features.timeRemainingMs);
  expect(observation.moneynessPercent).toBe(features.moneynessPercent);
  expect(observation.annualizedVolatility).toBe(features.annualizedVolatility);
  expect(observation.momentumPercent).toBe(features.momentumPercent);
  expect(observation.timestampMs).toBe(features.timestampMs);
  expect(observation.tradingDayUtc).toBe(features.tradingDayUtc);
}

describe("enrichResearchObservationFeatures", () => {
  it("matches legacy top-level observation fields when applied", () => {
    const candles = buildCandles([60_000, 60_100, 60_200, 60_300, 60_400]);
    const features = enrichResearchObservationFeatures({
      spotPrice: 59_500,
      strikePrice: 60_000,
      timeRemainingMs: 720_000,
      candles,
      observationTimestampMs: Date.parse("2026-04-27T14:30:00.000Z"),
    });

    const legacyFields = applyComputedFeaturesToObservationFields(features);

    expect(legacyFields.moneynessPercent).toBeCloseTo(-0.8333, 3);
    expect(legacyFields.timeRemainingMs).toBe(720_000);
    expect(legacyFields.tradingDayUtc).toBe("2026-04-27");
    expect(legacyFields.timestampMs).toBe(Date.parse("2026-04-27T14:30:00.000Z"));
    expect(features.hourUtc).toBe(14);
    expect(features.dayOfWeekUtc).toBe(1);
    expect(features.sessionBucketCode).toBe(2);
    expect(features.weekendFlag).toBe(0);
  });

  it("returns null feature values when candles and prices are missing", () => {
    const features = enrichResearchObservationFeatures({
      spotPrice: null,
      strikePrice: null,
      timeRemainingMs: null,
      candles: [],
      observationTimestampMs: null,
    });

    expect(features.moneynessPercent).toBeNull();
    expect(features.annualizedVolatility).toBeNull();
    expect(features.momentumPercent).toBeNull();
    expect(features.timestampMs).toBeNull();
    expect(features.tradingDayUtc).toBeNull();
    expect(features.hourUtc).toBeNull();
  });

  it("produces deterministic output for identical inputs", () => {
    const ctx = {
      spotPrice: 61_000,
      strikePrice: 60_000,
      timeRemainingMs: 300_000,
      candles: buildCandles([59_800, 60_000, 60_200, 60_400, 60_600, 60_800]),
      observationTimestampMs: Date.parse("2026-04-27T18:45:00.000Z"),
    };

    expect(enrichResearchObservationFeatures(ctx)).toEqual(
      enrichResearchObservationFeatures(ctx),
    );
  });

  it("uses 15-minute research momentum via canonical helper", () => {
    const candles = buildCandles(
      Array.from({ length: 16 }, (_, index) => 60_000 + index * 100),
    );

    const features = enrichResearchObservationFeatures({
      spotPrice: 60_100,
      strikePrice: 60_000,
      timeRemainingMs: 600_000,
      candles,
      observationTimestampMs: Date.parse("2026-04-27T12:00:00.000Z"),
    });

    expect(features.momentumPercent).toBe(
      computeResearchObservationMomentumPercent(candles),
    );
  });
});

describe("parseMispricingObservations enrichment bridge", () => {
  const outputPath = "data/research-results/noop/KXBTC15M/MARKET/research-output.json";

  function createReplayJson(options?: {
    candles?: EvaluationCandleSnapshot[];
    evaluatedAt?: string;
  }): string {
    return JSON.stringify({
      dataset: JSON.stringify({
        snapshots: [
          {
            ticker: "KXBTC15M-MARKET",
            marketWindow: {
              ticker: "KXBTC15M-MARKET",
              seriesTicker: "KXBTC15M",
              strikePriceUsd: 60_000,
            },
            settlement: { result: "yes", ticker: "KXBTC15M-MARKET" },
          },
        ],
      }),
      researchRun: JSON.stringify({
        config: { strategyId: "noop" },
        backtestResult: JSON.stringify({
          replayResult: {
            results: [
              {
                stepIndex: 0,
                engineInput: {
                  evaluatedAt: options?.evaluatedAt ?? "2026-04-27T14:30:00.000Z",
                  pricing: { yesBidCents: 40, yesAskCents: 60 },
                  market: { strikePrice: 60_000, timeRemainingMs: 12 * 60_000 },
                  btc: {
                    price: 59_500,
                    candles: options?.candles ?? [],
                  },
                },
              },
            ],
          },
        }),
      }),
      metadata: { strategyId: "noop" },
    });
  }

  it("attaches computedFeatures that mirror top-level fields", () => {
    const extracted = extractMispricingObservationsFromResearchOutput(
      createReplayJson({
        candles: buildCandles([60_000, 59_900, 59_800, 59_700, 59_600]),
      }),
      outputPath,
    );

    const observation = extracted.observations[0];
    expect(observation).toBeDefined();
    assertTopLevelMatchesComputedFeatures(observation!);
  });

  it("handles missing candles without throwing", () => {
    const extracted = extractMispricingObservationsFromResearchOutput(
      createReplayJson({ candles: [] }),
      outputPath,
    );

    expect(extracted.observations).toHaveLength(1);
    expect(extracted.observations[0]?.annualizedVolatility).toBeNull();
    expect(extracted.observations[0]?.momentumPercent).toBeNull();
    expect(extracted.observations[0]?.computedFeatures?.annualizedVolatility).toBeNull();
  });

  it("preserves dimension extraction from legacy top-level fields", () => {
    const extracted = extractMispricingObservationsFromResearchOutput(
      createReplayJson({
        candles: buildCandles([60_000, 60_100, 60_200, 60_300, 60_400]),
        evaluatedAt: "2026-04-27T14:30:00.000Z",
      }),
      outputPath,
    );

    const observation = extracted.observations[0]!;
    expect(extractDimensionValue("moneyness", observation)).toBe(observation.moneynessPercent);
    expect(extractDimensionValue("momentum15m", observation)).toBe(observation.momentumPercent);
    expect(extractDimensionValue("hourUtc", observation)).toBe(
      observation.computedFeatures?.hourUtc,
    );
  });

  it("keeps observations without computedFeatures compatible for extractors", () => {
    const legacyObservation: MispricingObservation = {
      strategyId: "noop",
      seriesTicker: "KXBTC15M",
      marketTicker: "KXBTC15M-MARKET",
      outputPath,
      stepIndex: 0,
      predictedProbability: 0.5,
      observedOutcome: 1,
      timeRemainingMs: 600_000,
      moneynessPercent: -0.5,
      annualizedVolatility: 0.4,
      momentumPercent: 0.2,
      timestampMs: Date.parse("2026-04-27T14:30:00.000Z"),
      tradingDayUtc: "2026-04-27",
    };

    expect(extractDimensionValue("volatility", legacyObservation)).toBe(0.4);
    expect(extractDimensionValue("hourUtc", legacyObservation)).toBe(14);
  });
});
