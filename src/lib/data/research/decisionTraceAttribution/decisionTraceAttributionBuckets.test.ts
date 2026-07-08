import { describe, expect, it } from "vitest";

import { TIME_REMAINING_BUCKET_DEFINITIONS as ATLAS_DEFINITIONS } from "@/lib/data/research/dimensions/bucketDefinitions";
import { TIME_REMAINING_BUCKET_DEFINITIONS as ATTRIBUTION_DEFINITIONS } from "@/lib/data/research/decisionTraceAttribution/decisionTraceAttributionBuckets";

describe("decisionTraceAttribution bucket compatibility", () => {
  it("re-exports the same time remaining bucket definitions as research dimensions", () => {
    expect(ATTRIBUTION_DEFINITIONS).toEqual(ATLAS_DEFINITIONS);
    expect(ATTRIBUTION_DEFINITIONS.map((bucket) => bucket.bucketId)).toEqual([
      "time-0-5m",
      "time-5-15m",
      "time-15-30m",
      "time-30m-plus",
    ]);
  });
});
