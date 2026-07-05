import {
  buildHistoricalImportabilityProfile,
  countSupportedWindows,
  countUnsupportedWindows,
} from "@/lib/data/research/coveragePlanner/importability";
import type { HistoricalImportabilityProfile } from "@/lib/data/research/coveragePlanner/importability";

import type { ParsedExpansionImportSummary } from "./pipelineDashboardTypes";

export type HistoricalImportabilitySection = {
  summaryPath: string;
  summaryPresent: boolean;
  supportedWindows: number;
  unsupportedWindows: number;
  historicalSuccessRate: number | null;
  totalAttempts: number;
  successfulImports: number;
  unsupportedMarkets: number;
  profile: HistoricalImportabilityProfile;
};

/** Builds the dashboard Historical Importability section from expansion summaries. */
export function buildHistoricalImportabilitySection(input: {
  summaryPath: string;
  expansionImportSummary: ParsedExpansionImportSummary | null;
}): HistoricalImportabilitySection {
  const profile = buildHistoricalImportabilityProfile({
    summaryPath: input.summaryPath,
    summaries: input.expansionImportSummary ? [input.expansionImportSummary.document] : [],
  });

  return {
    summaryPath: input.summaryPath,
    summaryPresent: profile.summaryPresent,
    supportedWindows: countSupportedWindows(profile),
    unsupportedWindows: countUnsupportedWindows(profile),
    historicalSuccessRate: profile.historicalSuccessRate,
    totalAttempts: profile.totalAttempts,
    successfulImports: profile.successfulImports,
    unsupportedMarkets: profile.unsupportedMarkets,
    profile,
  };
}
