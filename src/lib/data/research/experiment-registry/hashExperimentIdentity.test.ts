import { describe, expect, it } from "vitest";

import { buildExperimentId, hashFixtureContent } from "./hashExperimentIdentity";
import type { ExperimentIdentityInput } from "./experimentRegistryTypes";

const BASE_IDENTITY: ExperimentIdentityInput = {
  strategyId: "noop",
  strategyConfig: { threshold: 0.5 },
  costModelConfig: { kind: "zero" },
  datasetHash: "historical-dataset-abc12345",
  fixtureHash: "deadbeef",
  engineVersion: "5.10.0",
};

describe("hashExperimentIdentity", () => {
  it("builds deterministic experiment IDs", () => {
    const first = buildExperimentId(BASE_IDENTITY);
    const second = buildExperimentId(BASE_IDENTITY);

    expect(first).toBe(second);
    expect(first.startsWith("exp-v1-")).toBe(true);
  });

  it("changes experiment IDs when identity inputs change", () => {
    const baseline = buildExperimentId(BASE_IDENTITY);
    const changed = buildExperimentId({
      ...BASE_IDENTITY,
      datasetHash: "historical-dataset-other000",
    });

    expect(changed).not.toBe(baseline);
  });

  it("hashes fixture content deterministically", () => {
    const first = hashFixtureContent('{"runId":"a"}');
    const second = hashFixtureContent('{"runId":"a"}');

    expect(first).toBe(second);
    expect(first).toHaveLength(8);
  });
});
