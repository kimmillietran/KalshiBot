import { z } from "zod";

import { WalkForwardSplitError, WalkForwardSplitErrorCode } from "./walkForwardSplitErrors";
import type { WalkForwardSplitDefinition } from "./walkForwardSplitTypes";

const walkForwardSplitDefinitionSchema = z
  .object({
    splitId: z.string().trim().min(1),
    trainingWindowSize: z.number().finite().int().positive(),
    validationWindowSize: z.number().finite().int().positive(),
    stepSize: z.number().finite().int().positive(),
    embargoMarketCount: z.number().finite().int().nonnegative().default(0),
    allowOverlappingValidationWindows: z.boolean().default(true),
  })
  .strict();

export function parseWalkForwardSplitDefinitionJson(
  json: string,
): WalkForwardSplitDefinition {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new WalkForwardSplitError(
      "Walk-forward split config contains invalid JSON",
      WalkForwardSplitErrorCode.INVALID_SPLIT_ID,
    );
  }

  const result = walkForwardSplitDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    throw new WalkForwardSplitError(
      "Walk-forward split config failed schema validation",
      WalkForwardSplitErrorCode.INVALID_SPLIT_ID,
    );
  }

  return result.data;
}

export function normalizeWalkForwardSplitDefinition(
  config: WalkForwardSplitDefinition,
): WalkForwardSplitDefinition {
  return {
    splitId: config.splitId.trim(),
    trainingWindowSize: config.trainingWindowSize,
    validationWindowSize: config.validationWindowSize,
    stepSize: config.stepSize,
    embargoMarketCount: config.embargoMarketCount,
    allowOverlappingValidationWindows: config.allowOverlappingValidationWindows,
  };
}
