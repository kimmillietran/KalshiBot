/**
 * Settlement friction + label coverage study v0 constants and identities.
 * Descriptive economics only — no alpha / P&L selection.
 */

import { createHash } from "node:crypto";

import {
  M16_ER_ADAPTER_ID,
  M16_ER_ADAPTER_IDENTITY,
  buildM16ErFeeContract,
} from "@/lib/data/research/m16ExternalReplication";
import {
  MAX_EVENT_QUOTE_AGE_MS,
  RESPONSE_MATCH_TOLERANCE_MS,
} from "@/lib/data/research/kalshiTobMomentumFamily";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export const SETTLEMENT_FRICTION_STUDY_ID =
  "kalshi-kxbtc15m-settlement-friction-coverage-v0" as const;

export const SETTLEMENT_FRICTION_ANALYSIS_VERSION =
  "settlement-friction-coverage-v0.1" as const;

export const SETTLEMENT_FRICTION_DISCLAIMER =
  "Descriptive taker friction and settlement-LABEL coverage only. "
  + "Displayed-book scenarios are not realized fills or latency-adjusted live "
  + "performance. Low costs are not an edge; high costs alone do not disprove "
  + "every mechanism. BRTI-path coverage is not measured. No confirmatory reuse "
  + "of SPENT dates; no alpha fitting; no P&L selection.";

export const SETTLEMENT_FRICTION_HORIZONS_MS = [5_000, 15_000, 30_000] as const;
export type SettlementFrictionHorizonMs =
  (typeof SETTLEMENT_FRICTION_HORIZONS_MS)[number];

export const SETTLEMENT_FRICTION_SAMPLE_CADENCE_MS = 60_000 as const;

/** Bound to M15 / momentum-family response match tolerance. */
export const SETTLEMENT_FRICTION_RESPONSE_MATCH_TOLERANCE_MS =
  RESPONSE_MATCH_TOLERANCE_MS;

/** Bound to momentum-family fixed quote-age gate. */
export const SETTLEMENT_FRICTION_MAX_QUOTE_AGE_MS = MAX_EVENT_QUOTE_AGE_MS;

export const SETTLEMENT_FRICTION_MIN_DISPLAYED_SIZE = 1 as const;

export const SETTLEMENT_FRICTION_ADAPTER_ID = M16_ER_ADAPTER_ID;
export const SETTLEMENT_FRICTION_ADAPTER_IDENTITY = M16_ER_ADAPTER_IDENTITY;

export const M16_ER_DAY_CLUSTERS_RELATIVE_PATH =
  "data/research-results/external-kalshi-data-audit/m16-er-day-clusters.json" as const;

export const CRYPTOSTRUCT_RESERVOIR_STATUS_RELATIVE_PATH =
  "data/research-results/external-kalshi-data-audit/cryptostruct-reservoir-status.json" as const;

export const M16_ER_ACQUISITION_MANIFEST_RELATIVE_PATH =
  "data/research-results/external-kalshi-data-audit/m16-er-acquisition-manifest.json" as const;

export const M16_ER_IDENTITIES_RELATIVE_PATH =
  "data/research-results/external-kalshi-data-audit/m16-er-identities.json" as const;

export class SettlementFrictionCoverageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementFrictionCoverageError";
  }
}

export type SettlementFrictionConfig = {
  studyId: typeof SETTLEMENT_FRICTION_STUDY_ID;
  analysisVersion: typeof SETTLEMENT_FRICTION_ANALYSIS_VERSION;
  sampleCadenceMs: typeof SETTLEMENT_FRICTION_SAMPLE_CADENCE_MS;
  horizonsMs: typeof SETTLEMENT_FRICTION_HORIZONS_MS;
  responseMatchToleranceMs: typeof SETTLEMENT_FRICTION_RESPONSE_MATCH_TOLERANCE_MS;
  maxQuoteAgeMs: typeof SETTLEMENT_FRICTION_MAX_QUOTE_AGE_MS;
  minDisplayedSize: typeof SETTLEMENT_FRICTION_MIN_DISPLAYED_SIZE;
  adapterId: typeof SETTLEMENT_FRICTION_ADAPTER_ID;
  adapterIdentity: typeof SETTLEMENT_FRICTION_ADAPTER_IDENTITY;
  feeContractIdentity: string;
  referencedM16FeeContractIdentity: string;
  timestampBasis:
    "cryptostruct-admission-time-ms-from-ad_ts-nanoseconds-div-1e6";
  bucketAlignment: "utc-wall-clock-floor-timestampMs-div-cadenceMs";
  quoteOrdering:
    "sort-by-timestampMs-ascending-then-stable-file-sequence; reject-unsortable-null-timestamps";
  quoteAgeDefinition:
    "receive-minus-exchange-when-both-present; else-0-for-single-clock-cryptostruct-admission-stream";
  responseMatching:
    "first-eligible-quote-in-[t+H, t+H+tolerance]-strictly-after-t";
  sessionBoundary:
    "instrument.start-iso-as-open; ticker-HHMM-America/New_York-as-close-when-expiry-null";
  crossDayHandling:
    "samples-attributed-to-eligible-zip-utcDayKey-not-inferred-from-timestamp-alone";
  complementAskDerivation: "yesAsk=100-noBid-when-native-ask-absent";
  configurationIdentity: string;
};

export function bindSettlementFrictionFeeContractIdentity(): string {
  return buildM16ErFeeContract().feeContractIdentity;
}

export function buildSettlementFrictionConfig(): SettlementFrictionConfig {
  const fee = buildM16ErFeeContract();
  const base = {
    studyId: SETTLEMENT_FRICTION_STUDY_ID,
    analysisVersion: SETTLEMENT_FRICTION_ANALYSIS_VERSION,
    sampleCadenceMs: SETTLEMENT_FRICTION_SAMPLE_CADENCE_MS,
    horizonsMs: SETTLEMENT_FRICTION_HORIZONS_MS,
    responseMatchToleranceMs: SETTLEMENT_FRICTION_RESPONSE_MATCH_TOLERANCE_MS,
    maxQuoteAgeMs: SETTLEMENT_FRICTION_MAX_QUOTE_AGE_MS,
    minDisplayedSize: SETTLEMENT_FRICTION_MIN_DISPLAYED_SIZE,
    adapterId: SETTLEMENT_FRICTION_ADAPTER_ID,
    adapterIdentity: SETTLEMENT_FRICTION_ADAPTER_IDENTITY,
    feeContractIdentity: fee.feeContractIdentity,
    referencedM16FeeContractIdentity: fee.referencedM16FeeContractIdentity,
    timestampBasis:
      "cryptostruct-admission-time-ms-from-ad_ts-nanoseconds-div-1e6" as const,
    bucketAlignment:
      "utc-wall-clock-floor-timestampMs-div-cadenceMs" as const,
    quoteOrdering:
      "sort-by-timestampMs-ascending-then-stable-file-sequence; reject-unsortable-null-timestamps" as const,
    quoteAgeDefinition:
      "receive-minus-exchange-when-both-present; else-0-for-single-clock-cryptostruct-admission-stream" as const,
    responseMatching:
      "first-eligible-quote-in-[t+H, t+H+tolerance]-strictly-after-t" as const,
    sessionBoundary:
      "instrument.start-iso-as-open; ticker-HHMM-America/New_York-as-close-when-expiry-null" as const,
    crossDayHandling:
      "samples-attributed-to-eligible-zip-utcDayKey-not-inferred-from-timestamp-alone" as const,
    complementAskDerivation: "yesAsk=100-noBid-when-native-ask-absent" as const,
  };
  const configurationIdentity = createHash("sha256")
    .update(stableStringify(base))
    .digest("hex");
  return { ...base, configurationIdentity };
}

export function assertSettlementFrictionFeeIdentity(expected: string): void {
  const actual = bindSettlementFrictionFeeContractIdentity();
  if (actual !== expected) {
    throw new SettlementFrictionCoverageError(
      `fee-contract identity mismatch: expected ${expected}, got ${actual}`,
    );
  }
}

export function assertSettlementFrictionAdapterIdentity(expected: string): void {
  if (expected !== SETTLEMENT_FRICTION_ADAPTER_IDENTITY) {
    throw new SettlementFrictionCoverageError(
      `adapter identity mismatch: expected ${SETTLEMENT_FRICTION_ADAPTER_IDENTITY}, got ${expected}`,
    );
  }
}
