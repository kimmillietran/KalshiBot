import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  ParameterSweepError,
  ParameterSweepErrorCode,
  ParameterSweepExperimentFactoryError,
} from "./errors";
import type {
  ParameterCombination,
  ParameterSweepConfig,
  ParameterSweepExperimentConfig,
  ParameterSweepExperimentResult,
  ParameterSweepResult,
  RunParameterSweepOptions,
  SweepParameter,
} from "./parameterSweepTypes";

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

function stableValueKey(value: unknown): string {
  return stableStringify(value);
}

export function validateSweepParameters(
  parameters: readonly SweepParameter[],
): void {
  if (parameters.length === 0) {
    throw new ParameterSweepError(ParameterSweepErrorCode.EMPTY_PARAMETER_LIST);
  }

  const seenNames = new Set<string>();

  for (const parameter of parameters) {
    const name = parameter.name.trim();
    if (!name) {
      throw new ParameterSweepError(
        ParameterSweepErrorCode.INVALID_PARAMETER_NAME,
      );
    }
    if (seenNames.has(name)) {
      throw new ParameterSweepError(
        ParameterSweepErrorCode.DUPLICATE_PARAMETER_NAME,
      );
    }
    seenNames.add(name);

    if (parameter.values.length === 0) {
      throw new ParameterSweepError(ParameterSweepErrorCode.EMPTY_PARAMETER_VALUES);
    }

    const seenValues = new Set<string>();
    for (const value of parameter.values) {
      const key = stableValueKey(value);
      if (seenValues.has(key)) {
        throw new ParameterSweepError(
          ParameterSweepErrorCode.DUPLICATE_PARAMETER_VALUE,
        );
      }
      seenValues.add(key);
    }
  }
}

export function validateParameterSweepConfig(config: ParameterSweepConfig): void {
  if (!config.sweepId.trim()) {
    throw new ParameterSweepError(ParameterSweepErrorCode.INVALID_SWEEP_ID);
  }

  validateSweepParameters(config.parameters);
}

export function validateParameterSweepExperimentConfig(
  config: ParameterSweepExperimentConfig,
): void {
  if (!config.experimentId.trim() || !config.sweepId.trim()) {
    throw new ParameterSweepError(
      ParameterSweepErrorCode.INVALID_EXPERIMENT_CONFIG,
    );
  }

  if (config.parameters === null || typeof config.parameters !== "object") {
    throw new ParameterSweepError(
      ParameterSweepErrorCode.INVALID_EXPERIMENT_CONFIG,
    );
  }
}

/** Deterministic Cartesian product respecting parameter declaration order. */
export function generateParameterCombinations(
  parameters: readonly SweepParameter[],
): readonly ParameterCombination[] {
  validateSweepParameters(parameters);

  let combinations: Record<string, unknown>[] = [{}];

  for (const parameter of parameters) {
    const name = parameter.name.trim();
    const nextCombinations: Record<string, unknown>[] = [];

    for (const combination of combinations) {
      for (const value of parameter.values) {
        nextCombinations.push({
          ...combination,
          [name]: value,
        });
      }
    }

    combinations = nextCombinations;
  }

  return Object.freeze(
    combinations.map((values) =>
      deepFreeze({
        values: deepFreeze({ ...values }),
      }),
    ),
  );
}

/** Default sweep stub until experimentFactory wires 6.6A runResearchExperiment. */
function runParameterSweepStubExperiment(
  config: ParameterSweepExperimentConfig,
): ParameterSweepExperimentResult {
  validateParameterSweepExperimentConfig(config);

  return deepFreeze({
    experimentId: config.experimentId,
    sweepId: config.sweepId,
    parameters: deepFreeze({ ...config.parameters }),
    status: "completed" as const,
  });
}

export function runParameterSweep(
  config: ParameterSweepConfig,
  options: RunParameterSweepOptions = {},
): ParameterSweepResult {
  validateParameterSweepConfig(config);

  const executeExperiment =
    options.runExperiment ?? runParameterSweepStubExperiment;
  const combinations = generateParameterCombinations(config.parameters);
  const experiments: ParameterSweepExperimentResult[] = [];

  combinations.forEach((combination) => {
    let experimentConfig: ParameterSweepExperimentConfig;

    try {
      experimentConfig = config.experimentFactory(combination.values);
    } catch (error) {
      throw new ParameterSweepExperimentFactoryError(error);
    }

    validateParameterSweepExperimentConfig(experimentConfig);

    if (experimentConfig.sweepId !== config.sweepId) {
      throw new ParameterSweepError(
        ParameterSweepErrorCode.INVALID_EXPERIMENT_CONFIG,
      );
    }

    experiments.push(executeExperiment(experimentConfig));
  });

  return deepFreeze({
    sweepId: config.sweepId,
    combinations,
    experiments: Object.freeze([...experiments]),
    completedCount: experiments.length,
  });
}

export function serializeParameterSweepResult(
  result: ParameterSweepResult,
): string {
  return stableStringify(result);
}
