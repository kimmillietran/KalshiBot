import { buildMarketFeatureVector } from "@/lib/features";
import type { MarketFeatureVector } from "@/lib/features/types";
import { snapshotToFeatureInput } from "@/lib/trading/snapshot/toFeatureInput";
import type { EvaluationSnapshot } from "@/types/domain/trading";

/** Build a deterministic feature vector from a validated evaluation snapshot. */
export function extractFeaturesFromSnapshot(
  snapshot: EvaluationSnapshot,
): MarketFeatureVector {
  return buildMarketFeatureVector(snapshotToFeatureInput(snapshot));
}
