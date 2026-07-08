import { describe, expect, it } from "vitest";

import {
  computeBenjaminiYekutieliFdr,
  computeEffectiveSampleSizeEstimate,
  computeSignedEdgeSamples,
  computeSplitPowerMetrics,
  groupObservationsByMarketDay,
  harmonicNumber,
} from "./oosPowerCorrectionMath";

describe("oosPowerCorrectionMath", () => {
  it("computes conservative effective sample size", () => {
    expect(
      computeEffectiveSampleSizeEstimate({
        rawObservationCount: 100,
        independentMarketCount: 8,
        marketDayCount: 12,
      }),
    ).toBe(8);
  });

  it("uses effective sample size for inference and min effect cents for MDE gate", () => {
    const edgeSamples = [0.01, 0.02, 0.01, 0.02, 0.01, 0.02, 0.01, 0.02];
    const conservative = computeSplitPowerMetrics({
      edgeSamples,
      effectiveSampleSize: 5,
      alpha: 0.05,
      targetPower: 0.8,
      minEffectCents: 2,
    });
    const optimistic = computeSplitPowerMetrics({
      edgeSamples,
      effectiveSampleSize: 8,
      alpha: 0.05,
      targetPower: 0.8,
      minEffectCents: 2,
    });

    expect(conservative.observedNetEdge).toBeCloseTo(0.015);
    expect(conservative.clearsMde).toBe(false);
    expect(conservative.minimumDetectableEffect).toBeGreaterThan(
      optimistic.minimumDetectableEffect!,
    );
  });

  it("computes signed edge samples by calibration direction", () => {
    const edges = computeSignedEdgeSamples([
      { predictedProbability: 0.7, observedOutcome: 1, calibrationDirection: "over" },
      { predictedProbability: 0.8, observedOutcome: 0, calibrationDirection: "under" },
    ]);

    expect(edges[0]).toBeCloseTo(0.3);
    expect(edges[1]).toBeCloseTo(0.8);
  });

  it("classifies underpowered splits with too few samples", () => {
    const metrics = computeSplitPowerMetrics({
      edgeSamples: [0.01],
      effectiveSampleSize: 1,
      alpha: 0.05,
      targetPower: 0.8,
      minEffectCents: 2,
    });

    expect(metrics.isUnderpowered).toBe(true);
    expect(metrics.uncorrectedPValue).toBeNull();
  });

  it("applies BY correction with monotonic q-values", () => {
    const corrected = computeBenjaminiYekutieliFdr(
      [
        { id: "a", rawPValue: 0.001 },
        { id: "b", rawPValue: 0.04 },
        { id: "c", rawPValue: 0.2 },
      ],
      0.05,
    );

    const qValues = corrected
      .map((entry) => entry.qValue)
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right);

    expect(qValues[0]).toBeLessThanOrEqual(qValues[1]!);
    expect(corrected.find((entry) => entry.id === "a")?.rejected).toBe(true);
  });

  it("handles empty BY correction input", () => {
    expect(computeBenjaminiYekutieliFdr([], 0.05)).toEqual([]);
  });

  it("handles single-candidate BY correction", () => {
    const corrected = computeBenjaminiYekutieliFdr(
      [{ id: "only", rawPValue: 0.03 }],
      0.05,
    );

    expect(corrected).toHaveLength(1);
    expect(corrected[0]?.qValue).not.toBeNull();
  });

  it("groups observations by market-day block key", () => {
    const blocks = groupObservationsByMarketDay([
      { marketTicker: "M1", tradingDayUtc: "2025-10-01" },
      { marketTicker: "M1", tradingDayUtc: "2025-10-01" },
      { marketTicker: "M2", tradingDayUtc: "2025-10-01" },
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.items).toHaveLength(2);
  });

  it("uses harmonic number for BY correction constant", () => {
    expect(harmonicNumber(3)).toBeCloseTo(1 + 0.5 + 1 / 3, 6);
  });
});
