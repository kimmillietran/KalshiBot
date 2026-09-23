/**
 * No-spend acquisition planner — never executes purchase.
 */

import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { CryptostructSanitizedInventory } from "./inventory";
import type { CryptostructReservoirSnapshot } from "./ledger";
import { CRYPTOSTRUCT_RESERVOIR_SERIES } from "./types";

export type CryptostructAcquisitionPlan = {
  planVersion: "cryptostruct-kxbtc15m-acquisition-plan-v1";
  disposition: "PURCHASE_PLAN_ONLY";
  purchaseExecuted: false;
  series: typeof CRYPTOSTRUCT_RESERVOIR_SERIES;
  desiredNewSealedDays: number;
  alreadyOwnedSealedUtcDates: readonly string[];
  alreadyOwnedSpentOrExcludedUtcDates: readonly string[];
  availableUnownedUtcDates: readonly string[];
  proposedPurchaseUtcDates: readonly string[];
  shortfallAfterAvailableUnowned: number;
  estimatedCreditsIfOnePerDay: number | null;
  estimatedListPriceEurIfNoCredits: number | null;
  listPriceEurPerSeriesDay: number;
  note: string;
  planContentSha256: string;
};

export function planAcquisition(input: {
  snapshot: CryptostructReservoirSnapshot;
  inventory: CryptostructSanitizedInventory;
  desiredNewSealedDays: number;
  listPriceEurPerSeriesDay?: number;
}): CryptostructAcquisitionPlan {
  const listPrice = input.listPriceEurPerSeriesDay ?? 1;
  const sealed = Object.values(input.snapshot.days)
    .filter((d) => d.state === "OWNED_SEALED_UNASSIGNED")
    .map((d) => d.utcDate)
    .sort();
  const spentOrExcluded = Object.values(input.snapshot.days)
    .filter((d) =>
      d.owned
      && d.state !== "OWNED_SEALED_UNASSIGNED"
      && d.state !== "RESERVED_VALIDATION"
      && d.state !== "RESERVED_HOLDOUT"
    )
    .map((d) => d.utcDate)
    .sort();

  const available = [...input.inventory.availableUnownedUtcDates].sort();
  const proposed = available.slice(0, Math.max(0, input.desiredNewSealedDays));
  const shortfall = Math.max(0, input.desiredNewSealedDays - proposed.length);

  const body = {
    planVersion: "cryptostruct-kxbtc15m-acquisition-plan-v1" as const,
    disposition: "PURCHASE_PLAN_ONLY" as const,
    purchaseExecuted: false as const,
    series: CRYPTOSTRUCT_RESERVOIR_SERIES,
    desiredNewSealedDays: input.desiredNewSealedDays,
    alreadyOwnedSealedUtcDates: sealed,
    alreadyOwnedSpentOrExcludedUtcDates: spentOrExcluded,
    availableUnownedUtcDates: available,
    proposedPurchaseUtcDates: proposed,
    shortfallAfterAvailableUnowned: shortfall,
    estimatedCreditsIfOnePerDay: proposed.length,
    estimatedListPriceEurIfNoCredits: proposed.length * listPrice,
    listPriceEurPerSeriesDay: listPrice,
    note:
      "Informational only. HUMAN APPROVAL required before any future purchase. "
      + "This planner never executes checkout, credit spend, download, or restore.",
  };

  return {
    ...body,
    planContentSha256: createHash("sha256")
      .update(stableStringify(body))
      .digest("hex"),
  };
}
