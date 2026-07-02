import { ParameterStrategySweepError, ParameterStrategySweepErrorCode } from "./errors";
import type { ParameterSweepDefinition } from "./types";
import { validateParameterSweepDefinition } from "./generateParameterSets";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseParameterSweepDefinitionJson(
  json: string,
): ParameterSweepDefinition {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new ParameterStrategySweepError(
      "parameter sweep definition must be valid JSON",
      ParameterStrategySweepErrorCode.INVALID_CONFIG_JSON,
      { cause: error },
    );
  }

  if (!isRecord(parsed)) {
    throw new ParameterStrategySweepError(
      "parameter sweep definition must be a JSON object",
      ParameterStrategySweepErrorCode.INVALID_CONFIG_JSON,
    );
  }

  const strategyId = parsed.strategyId;
  if (typeof strategyId !== "string") {
    throw new ParameterStrategySweepError(
      "strategyId must be a string",
      ParameterStrategySweepErrorCode.INVALID_DEFINITION,
    );
  }

  const parametersInput = parsed.parameters;
  if (parametersInput === undefined) {
    throw new ParameterStrategySweepError(
      "parameters object is required",
      ParameterStrategySweepErrorCode.INVALID_DEFINITION,
    );
  }

  if (!isRecord(parametersInput)) {
    throw new ParameterStrategySweepError(
      "parameters must be an object",
      ParameterStrategySweepErrorCode.INVALID_DEFINITION,
    );
  }

  const parameters: Record<string, readonly unknown[]> = {};

  for (const [name, values] of Object.entries(parametersInput)) {
    if (!Array.isArray(values)) {
      throw new ParameterStrategySweepError(
        `parameter "${name}" must be an array`,
        ParameterStrategySweepErrorCode.INVALID_DEFINITION,
      );
    }

    parameters[name] = Object.freeze([...values]);
  }

  const definition: ParameterSweepDefinition = {
    strategyId,
    parameters: Object.freeze(parameters),
  };

  validateParameterSweepDefinition(definition);
  return definition;
}
