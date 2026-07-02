import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { BatchImportFailureAnalysis } from "./batchImportFailureAnalysisTypes";

/** Deterministic JSON serialization for import failure analysis reports. */
export function serializeBatchImportFailureAnalysis(
  analysis: BatchImportFailureAnalysis,
): string {
  return stableStringify({
    totalConfigs: analysis.totalConfigs,
    successfulImports: analysis.successfulImports,
    failedImports: analysis.failedImports,
    failureReasons: analysis.failureReasons.map((reason) => ({
      code: reason.code,
      count: reason.count,
      percentage: reason.percentage,
      examples: [...reason.examples],
    })),
    recoverableFailures: analysis.recoverableFailures,
    unrecoverableFailures: analysis.unrecoverableFailures,
    recommendations: [...analysis.recommendations],
  });
}
