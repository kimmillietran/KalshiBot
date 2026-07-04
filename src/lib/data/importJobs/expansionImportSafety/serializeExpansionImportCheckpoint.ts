import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { HistoricalExpansionImportCheckpoint } from "./expansionImportSafetyTypes";

/** Serializes an expansion import checkpoint as stable JSON. */
export function serializeExpansionImportCheckpoint(
  checkpoint: HistoricalExpansionImportCheckpoint,
): string {
  return stableStringify(checkpoint);
}
