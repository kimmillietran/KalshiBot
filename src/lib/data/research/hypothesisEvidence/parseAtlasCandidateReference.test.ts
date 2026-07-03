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
    });
  });

  it("extracts regime axis labels", () => {
    expect(
      parseBucketAxisLabels("coarse-prob-1-coarse-regime-high"),
    ).toEqual({
      probabilityBucket: "coarse-prob-1",
      timeBucket: null,
      regimeBucket: "coarse-regime-high",
    });
  });
});
