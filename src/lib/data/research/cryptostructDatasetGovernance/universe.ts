/**
 * Frozen CryptoStruct KXBTC15M candidate date universe for M16-ER.
 * Catalog metadata only — no strategy outcomes, no ZIP opens beyond quality-audit.
 */

import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  CRYPTOSTRUCT_COMPLETE_RECORDING_FROM_UTC,
  enumerateUtcDatesInclusive,
  maintenanceOverlapsM16ErGovernedWindow,
} from "./calendar";
import {
  CRYPTOSTRUCT_PROVIDER,
  CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES,
  CRYPTOSTRUCT_SERIES,
  createEmptyCryptostructDatasetLedger,
  registerUnacquiredDay,
  seedQualityAuditOnlyDays,
  type CryptostructDatasetLedger,
} from "./ledger";

/**
 * Catalog freeze bounds (provider continuous day-bundle claim + public listings).
 * Inclusive end = last publicly listed complete series-day before prospective M16
 * collection day 2026-09-22.
 */
export const CRYPTOSTRUCT_CATALOG_FREEZE = {
  frozenAtUtc: "2026-09-23T02:30:00.000Z",
  providerClaim:
    "CryptoStruct continuous KXBTC15M series-day bundles Feb 2026–present; complete recording from contract-window open on/after 2026-08-14",
  completeRecordingFromUtc: CRYPTOSTRUCT_COMPLETE_RECORDING_FROM_UTC,
  /** Last day included in freeze (inclusive). */
  catalogEndUtcInclusive: "2026-09-21",
  creditsPerSeriesDay: 1,
  premiumMonthlyCredits: 50,
  listPriceEurPerSeriesDay: 1,
  sourcePages: [
    "https://cryptostruct.com/prediction-markets/kalshi-btc-15m",
    "https://cryptostruct.com/pricing",
  ],
} as const;

export const M16_ER_PROSPECTIVE_EXCLUSION_FROM_UTC = "2026-09-22" as const;

export type CryptostructCandidateUniverse = {
  universeVersion: "cryptostruct-kxbtc15m-m16-er-universe-v1";
  provider: typeof CRYPTOSTRUCT_PROVIDER;
  series: typeof CRYPTOSTRUCT_SERIES;
  catalogFreeze: typeof CRYPTOSTRUCT_CATALOG_FREEZE;
  qualityAuditOnlyDates: readonly string[];
  excludedBecauseQualityAuditOnly: readonly string[];
  excludedBecauseBeforeCompleteRecording: readonly string[];
  excludedBecauseProspectiveM16Calendar: readonly string[];
  thursdayMaintenanceOverlapsGoverned18_22Z: false;
  candidateUntouchedUtcDates: readonly string[];
  candidateCount: number;
  universeDefinitionIdentity: string;
};

export function buildCryptostructCandidateUniverse(): CryptostructCandidateUniverse {
  const allPostCutoff = enumerateUtcDatesInclusive(
    CRYPTOSTRUCT_COMPLETE_RECORDING_FROM_UTC,
    CRYPTOSTRUCT_CATALOG_FREEZE.catalogEndUtcInclusive,
  );
  const qualitySet = new Set<string>(CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES);
  const candidates = allPostCutoff.filter((d) => !qualitySet.has(d));

  // Sanity: no Thursday maintenance overlap with 18–22Z in this range
  for (const d of candidates) {
    if (maintenanceOverlapsM16ErGovernedWindow(d)) {
      throw new Error(
        `unexpected maintenance overlap with 18–22Z on ${d} — revise calendar logic`,
      );
    }
  }

  const body = {
    universeVersion: "cryptostruct-kxbtc15m-m16-er-universe-v1" as const,
    provider: CRYPTOSTRUCT_PROVIDER,
    series: CRYPTOSTRUCT_SERIES,
    catalogFreeze: CRYPTOSTRUCT_CATALOG_FREEZE,
    qualityAuditOnlyDates: [...CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES],
    excludedBecauseQualityAuditOnly: [...CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES],
    excludedBecauseBeforeCompleteRecording: [] as string[],
    excludedBecauseProspectiveM16Calendar: [
      `dates >= ${M16_ER_PROSPECTIVE_EXCLUSION_FROM_UTC} excluded from this freeze`,
    ],
    thursdayMaintenanceOverlapsGoverned18_22Z: false as const,
    candidateUntouchedUtcDates: candidates,
    candidateCount: candidates.length,
  };

  const universeDefinitionIdentity = createHash("sha256")
    .update(stableStringify(body))
    .digest("hex");

  return { ...body, universeDefinitionIdentity };
}

/** Build ledger with quality-audit seeds + UNACQUIRED candidates. */
export function buildFrozenCryptostructLedgerForM16Er(): CryptostructDatasetLedger {
  const universe = buildCryptostructCandidateUniverse();
  let ledger = createEmptyCryptostructDatasetLedger();
  ledger = seedQualityAuditOnlyDays(
    ledger,
    "2026-09-23T00:00:00.000Z",
  );
  for (const utcDate of universe.candidateUntouchedUtcDates) {
    ledger = registerUnacquiredDay(
      ledger,
      utcDate,
      "M16-ER candidate — UNACQUIRED at protocol freeze; not opened",
    );
  }
  return ledger;
}
