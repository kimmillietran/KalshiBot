import type { HypothesisAtlasGroupId } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { HYPOTHESIS_ATLAS_GROUP_IDS } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import type { ParsedAtlasHypothesisRef } from "./hypothesisRobustnessTypes";

const ATLAS_GROUP_IDS = [...HYPOTHESIS_ATLAS_GROUP_IDS].sort(
  (left, right) => right.length - left.length,
) as readonly ParsedAtlasHypothesisRef["groupId"][];

/** Parses atlas-{groupId}-{bucketId}-{over|under} candidate IDs. */
export function parseAtlasHypothesisCandidateId(
  candidateId: string,
): ParsedAtlasHypothesisRef | null {
  if (!candidateId.startsWith("atlas-")) {
    return null;
  }

  const directionMatch = candidateId.match(/-(over|under)$/);
  if (!directionMatch) {
    return null;
  }

  const direction = directionMatch[1] as ParsedAtlasHypothesisRef["direction"];
  const core = candidateId.slice("atlas-".length, -(directionMatch[0].length));

  for (const groupId of ATLAS_GROUP_IDS) {
    const prefix = `${groupId}-`;
    if (core.startsWith(prefix)) {
      const bucketId = core.slice(prefix.length);
      if (!bucketId) {
        return null;
      }

      return { groupId: groupId as HypothesisAtlasGroupId, bucketId, direction };
    }
  }

  return null;
}
