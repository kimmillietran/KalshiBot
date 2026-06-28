import { describe, expect, it, vi } from "vitest";

import {
  ParameterSweepError,
  ParameterSweepErrorCode,
  ParameterSweepExperimentFactoryError,
} from "./errors";
import {
  generateParameterCombinations,
  runParameterSweep,
  serializeParameterSweepResult,
} from "./ParameterSweep";
import type { ParameterSweepConfig, SweepParameter } from "./parameterSweepTypes";

function createFactory(sweepId: string) {
  return vi.fn((parameters: Readonly<Record<string, unknown>>) => ({
    experimentId: `exp-${Object.values(parameters).join("-")}`,
    sweepId,
    parameters,
  }));
}

describe("generateParameterCombinations", () => {
  it("rejects an empty parameter list", () => {
    expect(() => generateParameterCombinations([])).toThrow(ParameterSweepError);
    try {
      generateParameterCombinations([]);
    } catch (error) {
      expect((error as ParameterSweepError).code).toBe(
        ParameterSweepErrorCode.EMPTY_PARAMETER_LIST,
      );
    }
  });

  it("rejects duplicate parameter names", () => {
    const parameters: SweepParameter[] = [
      { name: "rsi", values: [20] },
      { name: "rsi", values: [30] },
    ];

    expect(() => generateParameterCombinations(parameters)).toThrow(
      ParameterSweepError,
    );
  });

  it("rejects duplicate parameter values", () => {
    const parameters: SweepParameter[] = [
      { name: "rsi", values: [20, 20] },
    ];

    expect(() => generateParameterCombinations(parameters)).toThrow(
      ParameterSweepError,
    );
  });

  it("generates a single-parameter product", () => {
    const combinations = generateParameterCombinations([
      { name: "rsi", values: [20, 30] },
    ]);

    expect(combinations).toHaveLength(2);
    expect(combinations.map((entry) => entry.values.rsi)).toEqual([20, 30]);
  });

  it("generates a two-parameter Cartesian product in declaration order", () => {
    const combinations = generateParameterCombinations([
      { name: "rsi", values: [20, 30] },
      { name: "vwap", values: [true, false] },
    ]);

    expect(combinations).toHaveLength(4);
    expect(
      combinations.map((entry) => [entry.values.rsi, entry.values.vwap]),
    ).toEqual([
      [20, true],
      [20, false],
      [30, true],
      [30, false],
    ]);
  });

  it("generates a three-parameter Cartesian product deterministically", () => {
    const combinations = generateParameterCombinations([
      { name: "a", values: [1, 2] },
      { name: "b", values: ["x"] },
      { name: "c", values: [true, false] },
    ]);

    expect(combinations).toHaveLength(4);
    expect(
      combinations.map((entry) => [
        entry.values.a,
        entry.values.b,
        entry.values.c,
      ]),
    ).toEqual([
      [1, "x", true],
      [1, "x", false],
      [2, "x", true],
      [2, "x", false],
    ]);
  });
});

describe("runParameterSweep", () => {
  const sweepId = "sweep-6.6b";

  function createConfig(
    parameters: SweepParameter[],
    factory = createFactory(sweepId),
  ): ParameterSweepConfig {
    return {
      sweepId,
      parameters,
      experimentFactory: factory,
    };
  }

  it("produces identical results on repeated execution", () => {
    const config = createConfig([
      { name: "rsi", values: [20, 30] },
      { name: "vwap", values: [true, false] },
    ]);

    const first = serializeParameterSweepResult(runParameterSweep(config));
    const second = serializeParameterSweepResult(runParameterSweep(config));

    expect(first).toBe(second);
  });

  it("calls experimentFactory exactly once per combination", () => {
    const factory = createFactory(sweepId);
    const config = createConfig(
      [
        { name: "rsi", values: [20, 30] },
        { name: "edge", values: [5, 10] },
      ],
      factory,
    );

    const result = runParameterSweep(config);

    expect(factory).toHaveBeenCalledTimes(4);
    expect(result.completedCount).toBe(4);
    expect(result.experiments).toHaveLength(4);
  });

  it("returns deeply frozen immutable outputs", () => {
    const result = runParameterSweep(
      createConfig([{ name: "rsi", values: [20] }]),
    );

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.combinations)).toBe(true);
    expect(Object.isFrozen(result.experiments)).toBe(true);
    expect(Object.isFrozen(result.combinations[0])).toBe(true);
    expect(Object.isFrozen(result.combinations[0]?.values)).toBe(true);
  });

  it("serializes results deterministically", () => {
    const result = runParameterSweep(
      createConfig([
        { name: "rsi", values: [20] },
        { name: "vwap", values: [false] },
      ]),
    );

    expect(serializeParameterSweepResult(result)).toBe(
      serializeParameterSweepResult(result),
    );
  });

  it("wraps experimentFactory failures in a deterministic error", () => {
    const config: ParameterSweepConfig = {
      sweepId,
      parameters: [{ name: "rsi", values: [20] }],
      experimentFactory: () => {
        throw new Error("factory failed");
      },
    };

    expect(() => runParameterSweep(config)).toThrow(
      ParameterSweepExperimentFactoryError,
    );
  });

  it("does not mutate input parameter definitions", () => {
    const parameters: SweepParameter[] = [
      { name: "rsi", values: [20, 30] },
      { name: "vwap", values: [true, false] },
    ];
    const snapshot = JSON.stringify(parameters);

    runParameterSweep(createConfig(parameters));

    expect(JSON.stringify(parameters)).toBe(snapshot);
  });

  it("rejects invalid sweep configuration", () => {
    expect(() =>
      runParameterSweep({
        sweepId: " ",
        parameters: [{ name: "rsi", values: [20] }],
        experimentFactory: createFactory("ignored"),
      }),
    ).toThrow(ParameterSweepError);
  });

  it("uses injected runExperiment when provided", () => {
    const runExperiment = vi.fn(
      (config: {
        experimentId: string;
        sweepId: string;
        parameters: Readonly<Record<string, unknown>>;
      }) => ({
        ...config,
        status: "completed" as const,
      }),
    );
    const config = createConfig([{ name: "rsi", values: [20, 30] }]);

    runParameterSweep(config, { runExperiment });

    expect(runExperiment).toHaveBeenCalledTimes(2);
  });
});
