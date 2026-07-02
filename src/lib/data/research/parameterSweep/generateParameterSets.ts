import { stableStringify } from "@/lib/trading/config/hashConfig";

import { generateParameterCombinations } from "../ParameterSweep";
import type { SweepParameter } from "../parameterSweepTypes";

import { ParameterStrategySweepError, ParameterStrategySweepErrorCode } from "./errors";
import { formatParameterSetId } from "./formatParameterSetId";
import type { ParameterSet, ParameterSweepDefinition } from "./types";

function stableValueKey(value: unknown): string {
  return stableStringify(value);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }

  return value;
}

export function validateParameterSweepDefinition(
  definition: ParameterSweepDefinition,
): void {
  if (!definition.strategyId.trim()) {
    throw new ParameterStrategySweepError(
      "strategyId is required",
      ParameterStrategySweepErrorCode.INVALID_STRATEGY_ID,
    );
  }

  if (
    definition.parameters === null
    || typeof definition.parameters !== "object"
    || Array.isArray(definition.parameters)
  ) {
    throw new ParameterStrategySweepError(
      "parameters must be an object",
      ParameterStrategySweepErrorCode.INVALID_DEFINITION,
    );
  }

  for (const [name, values] of Object.entries(definition.parameters)) {
    if (!name.trim()) {
      throw new ParameterStrategySweepError(
        "parameter names must be non-empty strings",
        ParameterStrategySweepErrorCode.INVALID_DEFINITION,
      );
    }

    if (!Array.isArray(values)) {
      throw new ParameterStrategySweepError(
        `parameter "${name}" must be an array of values`,
        ParameterStrategySweepErrorCode.INVALID_DEFINITION,
      );
    }

    if (values.length === 0) {
      throw new ParameterStrategySweepError(
        `parameter "${name}" must include at least one value`,
        ParameterStrategySweepErrorCode.EMPTY_PARAMETER_VALUES,
      );
    }

    const seenValues = new Set<string>();
    for (const value of values) {
      const key = stableValueKey(value);
      if (seenValues.has(key)) {
        throw new ParameterStrategySweepError(
          `duplicate value for parameter "${name}"`,
          ParameterStrategySweepErrorCode.DUPLICATE_PARAMETER_VALUE,
        );
      }
      seenValues.add(key);
    }
  }
}

function definitionToSweepParameters(
  definition: ParameterSweepDefinition,
): readonly SweepParameter[] {
  return Object.keys(definition.parameters).map((name) => ({
    name,
    values: definition.parameters[name] ?? [],
  }));
}

/**
 * Generates deterministic parameter sets with stable ps-0001 ids from a sweep definition.
 * An empty parameters object yields a single default parameter set.
 */
export function generateParameterSets(
  definition: ParameterSweepDefinition,
): readonly ParameterSet[] {
  validateParameterSweepDefinition(definition);

  const parameterNames = Object.keys(definition.parameters);
  if (parameterNames.length === 0) {
    return Object.freeze([
      deepFreeze({
        parameterSetId: formatParameterSetId(1),
        config: deepFreeze({}),
      }),
    ]);
  }

  const combinations = generateParameterCombinations(
    definitionToSweepParameters(definition),
  );
  const seenConfigs = new Set<string>();
  const parameterSets: ParameterSet[] = [];

  combinations.forEach((combination, index) => {
    const configKey = stableStringify(combination.values);
    if (seenConfigs.has(configKey)) {
      throw new ParameterStrategySweepError(
        "duplicate parameter configuration detected in Cartesian product",
        ParameterStrategySweepErrorCode.DUPLICATE_PARAMETER_CONFIG,
      );
    }

    seenConfigs.add(configKey);
    parameterSets.push(
      deepFreeze({
        parameterSetId: formatParameterSetId(index + 1),
        config: deepFreeze({ ...combination.values }),
      }),
    );
  });

  return Object.freeze(parameterSets);
}
