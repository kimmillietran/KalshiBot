import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { parseAtlasHypothesisCandidateId } from "@/lib/data/research/hypothesisRobustness/parseAtlasHypothesisCandidateId";

import type { HypothesisTradeRule } from "./hypothesisTradeReplayTypes";

/** Maps atlas hypothesis metadata to a deterministic fade/buy trade rule. */
export function deriveHypothesisTradeRule(
  candidate: HypothesisCandidate,
): HypothesisTradeRule | null {
  const refinementRegistration = candidate.refinementRegistration;
  const atlasRef = refinementRegistration
    ? parseAtlasHypothesisCandidateId(refinementRegistration.parentHypothesisId)
    : parseAtlasHypothesisCandidateId(candidate.candidateId);

  if (!atlasRef) {
    return null;
  }

  const direction =
    candidate.bucketMetadata?.calibrationDirection ?? atlasRef.direction;

  if (direction === "over") {
    return {
      side: "no",
      calibrationDirection: "over",
      rationale:
        "Overconfident bucket: fade YES by buying NO at the available ask (cross-spread).",
    };
  }

  return {
    side: "yes",
    calibrationDirection: "under",
    rationale:
      "Underconfident bucket: fade NO by buying YES at the available ask (cross-spread).",
  };
}
