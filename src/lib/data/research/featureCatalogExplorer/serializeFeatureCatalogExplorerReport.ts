import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { FeatureCatalogExplorerReport } from "./featureCatalogExplorerTypes";

/** Serializes the feature catalog explorer report to stable JSON. */
export function serializeFeatureCatalogExplorerReport(
  report: FeatureCatalogExplorerReport,
): string {
  return stableStringify(report);
}
