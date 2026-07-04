import { describe, expect, it } from "vitest";

import {
  parseAtlasCandidateReference,
  parseBucketAxisLabels,
  parseLeadLagCandidateReference,
} from "./parseAtlasCandidateReference";

describe("parseAtlasCandidateReference", () => {
  it("parses atlas candidate ids for each supported group", () => {
    expect(
      parseAtlasCandidateReference("atlas-volatility-vol-high-over"),
    ).toEqual({
      groupId: "volatility",
      bucketId: "vol-high",
      direction: "over",
    });

    expect(
      parseAtlasCandidateReference(
        "atlas-probabilityTime-coarse-prob-2-coarse-time-early-under",
      ),
    ).toEqual({
      groupId: "probabilityTime",
      bucketId: "coarse-prob-2-coarse-time-early",
      direction: "under",
    });

    expect(
      parseAtlasCandidateReference(
        "atlas-volatilityProbabilityTime-vol-high-coarse-prob-2-coarse-time-early-over",
      ),
    ).toEqual({
      groupId: "volatilityProbabilityTime",
      bucketId: "vol-high-coarse-prob-2-coarse-time-early",
      direction: "over",
    });
  });

  it("returns null for non-atlas ids", () => {
    expect(parseAtlasCandidateReference("lead-lag-aggregate-lag-2")).toBeNull();
  });
});

describe("parseLeadLagCandidateReference", () => {
  it("parses aggregate lag candidate ids", () => {
    expect(parseLeadLagCandidateReference("lead-lag-aggregate-lag-3")).toEqual({
      lag: 3,
    });
  });
});

describe("parseBucketAxisLabels", () => {
  it("extracts probability and time axes from composite bucket ids", () => {
    expect(
      parseBucketAxisLabels("coarse-prob-2-coarse-time-late"),
    ).toEqual({
      probabilityBucket: "coarse-prob-2",
      timeBucket: "coarse-time-late",
      regimeBucket: null,
      moneynessBucket: null,
      volatilityBucket: null,
    });
  });

  it("extracts regime axis labels", () => {
    expect(
      parseBucketAxisLabels("coarse-prob-1-coarse-regime-high"),
    ).toEqual({
      probabilityBucket: "coarse-prob-1",
      timeBucket: null,
      regimeBucket: "coarse-regime-high",
      moneynessBucket: null,
      volatilityBucket: null,
    });
  });

  it("extracts moneyness and volatility axes from expanded bucket ids", () => {
    expect(
      parseBucketAxisLabels("vol-high-coarse-prob-2-coarse-time-late"),
    ).toEqual({
      volatilityBucket: "vol-high",
      probabilityBucket: "coarse-prob-2",
      timeBucket: "coarse-time-late",
      regimeBucket: null,
      moneynessBucket: null,
    });
  });
});
