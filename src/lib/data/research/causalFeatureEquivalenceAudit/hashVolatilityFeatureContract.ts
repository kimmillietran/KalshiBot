import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  GOVERNED_VOLATILITY_CONTRACT_FIELDS,
  VOLATILITY_CONTRACT_FIELDS,
  type VolatilityFeatureContract,
} from "./causalFeatureEquivalenceAuditTypes";

/**
 * Stable semantic hash of a volatility feature contract.
 * Includes all contract fields (governed + descriptive) with stable key order.
 * Callers must pass only the contract object — generatedAt / paths / warnings are
 * never part of this hash.
 */
export function hashVolatilityFeatureContract(contract: VolatilityFeatureContract): string {
  const normalized: Record<string, string | number | boolean | null> = {};
  for (const field of VOLATILITY_CONTRACT_FIELDS) {
    normalized[field] = contract[field];
  }
  // Touch governed list so drift in GOVERNED_VOLATILITY_CONTRACT_FIELDS fails closed
  // if a governed field is removed from VOLATILITY_CONTRACT_FIELDS.
  for (const field of GOVERNED_VOLATILITY_CONTRACT_FIELDS) {
    if (!(field in normalized)) {
      throw new Error(`Governed contract field missing from hash normalization: ${field}`);
    }
  }
  return createHash("sha256").update(stableStringify(normalized), "utf8").digest("hex");
}
