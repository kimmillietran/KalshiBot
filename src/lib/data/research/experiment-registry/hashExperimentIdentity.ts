import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import {
  EXPERIMENT_ID_PREFIX,
  type ExperimentIdentityInput,
} from "./experimentRegistryTypes";

export function buildExperimentIdentityHash(
  input: ExperimentIdentityInput,
): string {
  return fnv1a32(
    stableStringify({
      strategyId: input.strategyId,
      strategyConfig: input.strategyConfig,
      costModelConfig: input.costModelConfig,
      datasetHash: input.datasetHash,
      fixtureHash: input.fixtureHash,
      engineVersion: input.engineVersion,
    }),
  );
}

export function buildExperimentId(input: ExperimentIdentityInput): string {
  return `${EXPERIMENT_ID_PREFIX}-${buildExperimentIdentityHash(input)}`;
}

export function hashFixtureContent(fixtureJson: string): string {
  return fnv1a32(fixtureJson);
}

export function hashDatasetContent(datasetJson: string): string {
  return fnv1a32(datasetJson);
}
