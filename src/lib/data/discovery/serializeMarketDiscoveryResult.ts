import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { MarketDiscoveryResult } from "./discoveryTypes";

/** Deterministic JSON serialization for discovery output files. */
export function serializeMarketDiscoveryResult(
  result: MarketDiscoveryResult,
): string {
  return stableStringify({
    metadata: result.metadata,
    markets: [...result.markets],
    validation: {
      valid: result.validation.valid,
      errors: [...result.validation.errors],
      warnings: [...result.validation.warnings],
    },
    provenance: {
      pages: [...result.provenance.pages],
    },
  });
}
