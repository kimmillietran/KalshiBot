import { describe, expect, it } from "vitest";

import { parseAtlasHypothesisCandidateId } from "./parseAtlasHypothesisCandidateId";

describe("parseAtlasHypothesisCandidateId", () => {
  it("parses atlas candidate IDs with group, bucket, and direction", () => {
    expect(parseAtlasHypothesisCandidateId("atlas-volatility-vol-high-over")).toEqual({
      groupId: "volatility",
      bucketId: "vol-high",
      direction: "over",
    });
  });

  it("parses composite probability-time buckets", () => {
    expect(
      parseAtlasHypothesisCandidateId("atlas-probabilityTime-coarse-prob-1-time-mid-under"),
    ).toEqual({
      groupId: "probabilityTime",
      bucketId: "coarse-prob-1-time-mid",
      direction: "under",
    });
  });

  it("returns null for non-atlas IDs", () => {
    expect(parseAtlasHypothesisCandidateId("lead-lag-btc-spot-over")).toBeNull();
    expect(parseAtlasHypothesisCandidateId("not-a-hypothesis")).toBeNull();
  });
});
