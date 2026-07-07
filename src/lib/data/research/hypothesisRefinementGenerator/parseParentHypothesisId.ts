import { HYPOTHESIS_ATLAS_GROUP_IDS } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisAtlasGroupId } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

export type ParsedParentHypothesisId = {
  groupId: HypothesisAtlasGroupId;
  bucketId: string;
  direction: "over" | "under";
};

const SORTED_GROUP_IDS = [...HYPOTHESIS_ATLAS_GROUP_IDS].sort(
  (left, right) => right.length - left.length,
);

/** Parses atlas-style hypothesis ids into group, bucket, and calibration direction. */
export function parseParentHypothesisId(
  hypothesisId: string,
): ParsedParentHypothesisId | null {
  if (!hypothesisId.startsWith("atlas-")) {
    return null;
  }

  const directionMatch = /-(over|under)$/.exec(hypothesisId);
  if (!directionMatch) {
    return null;
  }

  const direction = directionMatch[1] as "over" | "under";
  const withoutAtlasPrefix = hypothesisId.slice("atlas-".length);
  const withoutDirection = withoutAtlasPrefix.slice(0, -(direction.length + 1));

  for (const groupId of SORTED_GROUP_IDS) {
    const prefix = `${groupId}-`;
    if (withoutDirection.startsWith(prefix)) {
      return {
        groupId,
        bucketId: withoutDirection.slice(prefix.length),
        direction,
      };
    }
  }

  return null;
}
