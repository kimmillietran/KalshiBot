/**
 * Deterministic outcome-blind validation/HOLDOUT allocation.
 */

import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { assertDateAllocatable } from "./invariants";
import {
  CryptostructReservoirError,
  type CryptostructReservoirSnapshot,
} from "./ledger";
import { CRYPTOSTRUCT_RESERVOIR_ALLOCATION_VERSION } from "./types";

export type CryptostructAllocationPlan = {
  allocationVersion: typeof CRYPTOSTRUCT_RESERVOIR_ALLOCATION_VERSION;
  scientificProtocolIdentity: string;
  researchLineage: string;
  requiredValidationDays: number;
  requiredHoldoutDays: number;
  eligibleUtcDates: readonly string[];
  excludedUtcDates: readonly { utcDate: string; reason: string }[];
  validationUtcDates: readonly string[];
  holdoutUtcDates: readonly string[];
  rankingAlgorithm:
    "sha256(protocolIdentity|allocationVersion|utcDate)-ascending";
  allocationContentSha256: string;
};

function rankKey(protocolIdentity: string, utcDate: string): string {
  return createHash("sha256")
    .update(
      `${protocolIdentity}|${CRYPTOSTRUCT_RESERVOIR_ALLOCATION_VERSION}|${utcDate}`,
    )
    .digest("hex");
}

export function planDeterministicAllocation(input: {
  snapshot: CryptostructReservoirSnapshot;
  scientificProtocolIdentity: string;
  researchLineage: string;
  requiredValidationDays: number;
  requiredHoldoutDays: number;
}): CryptostructAllocationPlan {
  if (!input.scientificProtocolIdentity) {
    throw new CryptostructReservoirError(
      "scientificProtocolIdentity required for allocation",
    );
  }
  if (input.requiredValidationDays < 0 || input.requiredHoldoutDays < 0) {
    throw new CryptostructReservoirError("required day counts must be >= 0");
  }

  const excluded: { utcDate: string; reason: string }[] = [];
  const eligible: string[] = [];

  const dates = Object.keys(input.snapshot.days).sort();
  for (const utcDate of dates) {
    const day = input.snapshot.days[utcDate]!;
    try {
      assertDateAllocatable(day);
      eligible.push(utcDate);
    } catch (e) {
      excluded.push({
        utcDate,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Stable sort by hash rank (not input order)
  const ranked = [...eligible].sort((a, b) => {
    const ha = rankKey(input.scientificProtocolIdentity, a);
    const hb = rankKey(input.scientificProtocolIdentity, b);
    return ha.localeCompare(hb) || a.localeCompare(b);
  });

  const need = input.requiredValidationDays + input.requiredHoldoutDays;
  if (ranked.length < need) {
    throw new CryptostructReservoirError(
      `insufficient OWNED_SEALED_UNASSIGNED dates: have ${ranked.length}, need ${need}`,
    );
  }

  const validationUtcDates = ranked.slice(0, input.requiredValidationDays);
  const holdoutUtcDates = ranked.slice(
    input.requiredValidationDays,
    need,
  );

  const overlap = validationUtcDates.filter((d) => holdoutUtcDates.includes(d));
  if (overlap.length > 0) {
    throw new CryptostructReservoirError(
      `validation/HOLDOUT collision: ${overlap.join(",")}`,
    );
  }

  const body = {
    allocationVersion: CRYPTOSTRUCT_RESERVOIR_ALLOCATION_VERSION,
    scientificProtocolIdentity: input.scientificProtocolIdentity,
    researchLineage: input.researchLineage,
    requiredValidationDays: input.requiredValidationDays,
    requiredHoldoutDays: input.requiredHoldoutDays,
    eligibleUtcDates: ranked,
    excludedUtcDates: excluded.sort((a, b) =>
      a.utcDate.localeCompare(b.utcDate),
    ),
    validationUtcDates,
    holdoutUtcDates,
    rankingAlgorithm:
      "sha256(protocolIdentity|allocationVersion|utcDate)-ascending" as const,
  };

  return {
    ...body,
    allocationContentSha256: createHash("sha256")
      .update(stableStringify(body))
      .digest("hex"),
  };
}
