import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import { observationMatchesResearchAxisGroupBucket } from "@/lib/data/research/dimensions";

import type { AtlasCandidateGroupId } from "./parseAtlasCandidateReference";

export type RegimeVolatilityByMarketKey = Map<string, "low" | "medium" | "high">;

/** Returns whether a mispricing observation belongs to an atlas bucket cell. */
export function observationMatchesAtlasBucket(
  groupId: AtlasCandidateGroupId,
  bucketId: string,
  observation: MispricingObservation,
  regimeVolatilityByMarket: RegimeVolatilityByMarketKey = new Map(),
): boolean {
  return observationMatchesResearchAxisGroupBucket({
    groupId,
    bucketId,
    observation,
    regimeVolatilityByMarket,
  });
}
