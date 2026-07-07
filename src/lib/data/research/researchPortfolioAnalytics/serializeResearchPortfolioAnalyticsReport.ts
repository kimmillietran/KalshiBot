import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { ResearchPortfolioAnalyticsReport } from "./researchPortfolioAnalyticsTypes";

export function serializeResearchPortfolioAnalyticsReport(
  report: ResearchPortfolioAnalyticsReport,
): string {
  return stableStringify(report);
}
