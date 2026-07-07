import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { ResearchRecommendationEngineReport } from "./researchRecommendationEngineTypes";

/** Serializes the recommendation engine report to stable JSON. */
export function serializeResearchRecommendationEngineReport(
  report: ResearchRecommendationEngineReport,
): string {
  return stableStringify(report);
}
