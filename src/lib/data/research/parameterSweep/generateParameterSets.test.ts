import { afterEach, describe, expect, it, vi } from "vitest";

import * as ParameterSweepModule from "../ParameterSweep";

import { generateParameterSets } from "./generateParameterSets";
import { ParameterStrategySweepError, ParameterStrategySweepErrorCode } from "./errors";
import type { ParameterSweepDefinition } from "./types";

describe("generateParameterSets", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates a deterministic Cartesian product with stable ps ids", () => {
    const definition: ParameterSweepDefinition = {
      strategyId: "fair-value-diffusion",
      parameters: {
        minimumEdgeThresholdCents: [2, 4],
        volatilityLookbackBars: [5, 10],
      },
    };

    const parameterSets = generateParameterSets(definition);

    expect(parameterSets).toHaveLength(4);
    expect(parameterSets.map((set) => set.parameterSetId)).toEqual([
      "ps-0001",
      "ps-0002",
      "ps-0003",
      "ps-0004",
    ]);
    expect(parameterSets.map((set) => set.config)).toEqual([
      { minimumEdgeThresholdCents: 2, volatilityLookbackBars: 5 },
      { minimumEdgeThresholdCents: 2, volatilityLookbackBars: 10 },
      { minimumEdgeThresholdCents: 4, volatilityLookbackBars: 5 },
      { minimumEdgeThresholdCents: 4, volatilityLookbackBars: 10 },
    ]);
  });

  it("preserves parameter declaration order for Cartesian expansion", () => {
    const definition: ParameterSweepDefinition = {
      strategyId: "fair-value-diffusion",
      parameters: {
        minimumEdgeThresholdCents: [2, 4],
        volatilityLookbackBars: [5],
        minimumTimeRemainingMs: [30_000, 60_000],
      },
    };

    const parameterSets = generateParameterSets(definition);

    expect(parameterSets).toHaveLength(4);
    expect(
      parameterSets.map((set) => [
        set.config.minimumEdgeThresholdCents,
        set.config.volatilityLookbackBars,
        set.config.minimumTimeRemainingMs,
      ]),
    ).toEqual([
      [2, 5, 30_000],
      [2, 5, 60_000],
      [4, 5, 30_000],
      [4, 5, 60_000],
    ]);
  });

  it("returns a single default parameter set for an empty parameter list", () => {
    const parameterSets = generateParameterSets({
      strategyId: "noop",
      parameters: {},
    });

    expect(parameterSets).toEqual([
      {
        parameterSetId: "ps-0001",
        config: {},
      },
    ]);
  });

  it("rejects duplicate values within a parameter", () => {
    expect(() =>
      generateParameterSets({
        strategyId: "noop",
        parameters: {
          minimumEdgeThresholdCents: [2, 2],
        },
      }),
    ).toThrow(ParameterStrategySweepError);

    try {
      generateParameterSets({
        strategyId: "noop",
        parameters: {
          minimumEdgeThresholdCents: [2, 2],
        },
      });
    } catch (error) {
      expect((error as ParameterStrategySweepError).code).toBe(
        ParameterStrategySweepErrorCode.DUPLICATE_PARAMETER_VALUE,
      );
    }
  });

  it("rejects duplicate configs produced by the Cartesian product", () => {
    vi.spyOn(ParameterSweepModule, "generateParameterCombinations").mockReturnValue([
      Object.freeze({ values: Object.freeze({ minimumEdgeThresholdCents: 2 }) }),
      Object.freeze({ values: Object.freeze({ minimumEdgeThresholdCents: 2 }) }),
    ]);

    expect(() =>
      generateParameterSets({
        strategyId: "noop",
        parameters: {
          minimumEdgeThresholdCents: [2],
        },
      }),
    ).toThrow(ParameterStrategySweepError);

    try {
      generateParameterSets({
        strategyId: "noop",
        parameters: {
          minimumEdgeThresholdCents: [2],
        },
      });
    } catch (error) {
      expect((error as ParameterStrategySweepError).code).toBe(
        ParameterStrategySweepErrorCode.DUPLICATE_PARAMETER_CONFIG,
      );
    }
  });

  it("rejects empty parameter value lists", () => {
    expect(() =>
      generateParameterSets({
        strategyId: "noop",
        parameters: {
          minimumEdgeThresholdCents: [],
        },
      }),
    ).toThrow(ParameterStrategySweepError);
  });

  it("produces identical results on repeated execution", () => {
    const definition: ParameterSweepDefinition = {
      strategyId: "fair-value-diffusion",
      parameters: {
        minimumEdgeThresholdCents: [2, 4, 6],
        minimumTimeRemainingMs: [30_000],
      },
    };

    const first = JSON.stringify(generateParameterSets(definition));
    const second = JSON.stringify(generateParameterSets(definition));

    expect(first).toBe(second);
  });
});
