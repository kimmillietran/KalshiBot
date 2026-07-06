import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import type { ExpansionDiscoveredMarket } from "../expansionExecutorTypes";

/** Deterministic checksum for cached discovery market payloads. */
export function computeDiscoveryCacheChecksum(
  markets: readonly ExpansionDiscoveredMarket[],
): string {
  return fnv1a32(stableStringify(markets));
}
