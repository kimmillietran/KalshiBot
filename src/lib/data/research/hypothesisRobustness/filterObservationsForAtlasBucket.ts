import type { RegimeVolatilityByMarketKey } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import { observationMatchesResearchAxisGroupBucket } from "@/lib/data/research/dimensions";

import type {
  EnrichedMispricingObservation,
  ParsedAtlasHypothesisRef,
} from "./hypothesisRobustnessTypes";

/** Filters enriched observations to those matching an atlas hypothesis bucket. */
export function filterObservationsForAtlasBucket(
  observations: readonly EnrichedMispricingObservation[],
  ref: ParsedAtlasHypothesisRef,
  regimeVolatilityByMarket: RegimeVolatilityByMarketKey,
): EnrichedMispricingObservation[] {
  return observations.filter((observation) =>
    observationMatchesResearchAxisGroupBucket({
      groupId: ref.groupId,
      bucketId: ref.bucketId,
      observation,
      regimeVolatilityByMarket,
    }),
  );
}
