import { describe, expect, it } from "vitest";

import { parseParameterSweepDefinitionJson } from "./parseParameterSweepDefinition";
import { ParameterStrategySweepError } from "./errors";

describe("parseParameterSweepDefinitionJson", () => {
  it("parses a parameter sweep definition", () => {
    expect(
      parseParameterSweepDefinitionJson(
        JSON.stringify({
          strategyId: "fair-value-diffusion",
          parameters: {
            minimumEdgeThresholdCents: [2, 4, 6, 8],
            volatilityLookbackBars: [5, 10, 20],
          },
        }),
      ),
    ).toEqual({
      strategyId: "fair-value-diffusion",
      parameters: {
        minimumEdgeThresholdCents: [2, 4, 6, 8],
        volatilityLookbackBars: [5, 10, 20],
      },
    });
  });

  it("rejects invalid JSON", () => {
    expect(() => parseParameterSweepDefinitionJson("{")).toThrow(
      ParameterStrategySweepError,
    );
  });
});
