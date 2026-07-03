import { describe, expect, it } from "vitest";

import { augmentResearchOutputWithSynthesizedMetadata } from "./augmentResearchOutputWithSynthesizedMetadata";

describe("augmentResearchOutputWithSynthesizedMetadata", () => {
  it("embeds synthesized strategy metadata in research output", () => {
    const serialized = JSON.stringify({
      dataset: "{}",
      researchRun: "{}",
      metadata: {
        durationMs: 1000,
        strategyId: "calibration-fade",
      },
    });

    const augmented = augmentResearchOutputWithSynthesizedMetadata(serialized, {
      sweepStrategyId: "synthesized/synth-atlas-vol-high-over",
      synthesized: {
        synthesizedStrategyId: "synth-atlas-vol-high-over",
        hypothesisId: "atlas-volatility-vol-high-over",
        strategyFamily: "calibration-fade",
        pluginStrategyId: "calibration-fade",
      },
    });

    const parsed = JSON.parse(augmented) as {
      synthesized: Record<string, string>;
      metadata: Record<string, string>;
    };

    expect(parsed.synthesized).toMatchObject({
      sweepStrategyId: "synthesized/synth-atlas-vol-high-over",
      synthesizedStrategyId: "synth-atlas-vol-high-over",
      hypothesisId: "atlas-volatility-vol-high-over",
    });
    expect(parsed.metadata.synthesizedStrategyId).toBe("synth-atlas-vol-high-over");
    expect(parsed.metadata.hypothesisId).toBe("atlas-volatility-vol-high-over");
  });
});
