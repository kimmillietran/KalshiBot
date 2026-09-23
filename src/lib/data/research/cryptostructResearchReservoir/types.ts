/**
 * CryptoStruct KXBTC15M research data reservoir — scientific state vocabulary.
 * Metadata only. No economic outcomes.
 */

export const CRYPTOSTRUCT_RESERVOIR_PROVIDER = "CryptoStruct" as const;
export const CRYPTOSTRUCT_RESERVOIR_SERIES = "KXBTC15M" as const;

export const CRYPTOSTRUCT_RESERVOIR_STATES = [
  "AVAILABLE_UNOWNED",
  "OWNED_SEALED_UNASSIGNED",
  "RESERVED_VALIDATION",
  "RESERVED_HOLDOUT",
  "OPEN_DISCOVERY",
  "SPENT_VALIDATION",
  "SPENT_HOLDOUT",
  "QUALITY_AUDIT_ONLY",
  "EXCLUDED",
  "UNKNOWN_QUARANTINED",
] as const;

export type CryptostructReservoirState =
  (typeof CRYPTOSTRUCT_RESERVOIR_STATES)[number];

/** States that may become confirmatory reservations. */
export const CRYPTOSTRUCT_RESERVOIR_ALLOCATABLE_STATES = [
  "OWNED_SEALED_UNASSIGNED",
] as const;

export type CryptostructReservoirAllocatableState =
  (typeof CRYPTOSTRUCT_RESERVOIR_ALLOCATABLE_STATES)[number];

/** Terminal / non-resealable confirmatory or burned states. */
export const CRYPTOSTRUCT_RESERVOIR_NON_SEALABLE_STATES = [
  "OPEN_DISCOVERY",
  "SPENT_VALIDATION",
  "SPENT_HOLDOUT",
  "QUALITY_AUDIT_ONLY",
  "EXCLUDED",
  "UNKNOWN_QUARANTINED",
] as const;

export const CRYPTOSTRUCT_RESERVOIR_EVENT_TYPES = [
  "vendor-availability-observed",
  "ownership-observed",
  "quality-audit-burned",
  "opened-for-discovery",
  "reserved-validation",
  "reserved-holdout",
  "validation-opened",
  "holdout-opened",
  "excluded",
  "quarantine",
  "inventory-imported",
] as const;

export type CryptostructReservoirEventType =
  (typeof CRYPTOSTRUCT_RESERVOIR_EVENT_TYPES)[number];

/** Forbidden economic / content fields in reservoir and MCP inventory inputs. */
export const CRYPTOSTRUCT_RESERVOIR_FORBIDDEN_FIELDS = [
  "pnl",
  "feeAdjustedPnl",
  "feeAdjustedPnlCents",
  "realizedReturn",
  "targetHit",
  "stopHit",
  "settlement",
  "winRate",
  "mfe",
  "mae",
  "exitPrice",
  "pValue",
  "tStatistic",
  "cr2Result",
  "meanReturn",
  "bidAsk",
  "yesBestBidCents",
  "noBestBidCents",
  "candidateIncidence",
  "volatility",
] as const;

export const M16_ER_PRIMARY_RESULT_CONTENT_SHA256 =
  "e6aba34ee5352c38254894babf1e7f7b2c668945dd95c9b92a370550b81b2fea" as const;

export const M16_ER_LINEAGE = "M16-ER" as const;

export const CRYPTOSTRUCT_RESERVOIR_ALLOCATION_VERSION =
  "cryptostruct-kxbtc15m-reservoir-allocation-v1" as const;
