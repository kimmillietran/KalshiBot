import { join } from "node:path";

import { plannedHistoryHourForClose } from "./historicalSemantics";
import { KalshiBrtiAccessProbeError } from "./types";

export const SELECTED_FOLLOW_UP_TICKER = "KXBTC15M-26AUG301415-15" as const;
export const AUTHORIZED_FOLLOW_UP_HOUR_START_UTC = "2026-08-30T18:00:00.000Z" as const;
export const AUTHORIZED_FOLLOW_UP_HOUR_END_EXCLUSIVE_UTC = "2026-08-30T19:00:00.000Z" as const;
export const V0_OFFICIAL_METADATA_SUMMARY_RELATIVE_PATH =
  "data/research-results/external-kalshi-data-audit/m17-prep-brti-access-probe/brti-access-probe-summary.json" as const;

export type OfficialTargetMetadata = {
  ticker: string;
  closeTimeUtc: string;
  expirationValue: string | null;
  provenance: {
    sourceId: "v0-official-rest-metadata" | "injected-fixture";
    closeTimeField: string;
    expirationValueField: string | null;
    retrievedVia: string;
  };
};

export type BoundHistoricalRequest = {
  ticker: string;
  closeTimeUtc: string;
  hourStartUtc: string;
  hourEndExclusiveUtc: string;
  settlementWindowInsideHour: boolean;
  matchesAuthorizedHour: boolean;
  discrepancy: string | null;
  expirationValue: string | null;
  expirationAvailableForComparison: boolean;
};

export type OfficialTargetBindResult =
  | { status: "bound"; metadata: OfficialTargetMetadata; request: BoundHistoricalRequest }
  | { status: "rejected"; reason: string; metadata: OfficialTargetMetadata | null; request: BoundHistoricalRequest | null }
  | { status: "missing"; reason: string; metadata: null; request: null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sameUtcInstant(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

export function bindHistoricalRequestToAuthorizedHour(metadata: OfficialTargetMetadata): BoundHistoricalRequest {
  const hour = plannedHistoryHourForClose(metadata.closeTimeUtc);
  const matchesAuthorizedHour = sameUtcInstant(hour.hourStartUtc, AUTHORIZED_FOLLOW_UP_HOUR_START_UTC)
    && sameUtcInstant(hour.hourEndExclusiveUtc, AUTHORIZED_FOLLOW_UP_HOUR_END_EXCLUSIVE_UTC);
  const discrepancies: string[] = [];
  if (!matchesAuthorizedHour) {
    discrepancies.push(
      `derived hour ${hour.hourStartUtc}–${hour.hourEndExclusiveUtc} does not match authorized ${AUTHORIZED_FOLLOW_UP_HOUR_START_UTC}–${AUTHORIZED_FOLLOW_UP_HOUR_END_EXCLUSIVE_UTC}`,
    );
  }
  if (!hour.settlementWindowInsideHour) {
    discrepancies.push("official settlement window is not inside the derived hour");
  }
  return {
    ticker: metadata.ticker,
    closeTimeUtc: metadata.closeTimeUtc,
    hourStartUtc: hour.hourStartUtc,
    hourEndExclusiveUtc: hour.hourEndExclusiveUtc,
    settlementWindowInsideHour: hour.settlementWindowInsideHour,
    matchesAuthorizedHour,
    discrepancy: discrepancies.length > 0 ? discrepancies.join("; ") : null,
    expirationValue: metadata.expirationValue,
    expirationAvailableForComparison: metadata.expirationValue != null && metadata.expirationValue.trim() !== "",
  };
}

export function validateOfficialTargetMetadata(input: {
  metadata: OfficialTargetMetadata;
  expectedTicker?: string;
}): OfficialTargetBindResult {
  const expectedTicker = input.expectedTicker ?? SELECTED_FOLLOW_UP_TICKER;
  if (input.metadata.ticker !== expectedTicker) {
    return {
      status: "rejected",
      reason: `official metadata ticker ${input.metadata.ticker} does not match selected ${expectedTicker}`,
      metadata: input.metadata,
      request: null,
    };
  }
  if (!Number.isFinite(Date.parse(input.metadata.closeTimeUtc))) {
    return {
      status: "rejected",
      reason: `official close_time is not parseable: ${input.metadata.closeTimeUtc}`,
      metadata: input.metadata,
      request: null,
    };
  }
  const request = bindHistoricalRequestToAuthorizedHour(input.metadata);
  if (request.discrepancy != null) {
    return {
      status: "rejected",
      reason: request.discrepancy,
      metadata: input.metadata,
      request,
    };
  }
  return { status: "bound", metadata: input.metadata, request };
}

function officialFromV0Target(target: Record<string, unknown>): OfficialTargetMetadata | null {
  const official = isRecord(target.official) ? target.official : null;
  if (!official) {
    return null;
  }
  const ticker = typeof official.ticker === "string" ? official.ticker : null;
  const closeTimeUtc = typeof official.closeTime === "string" ? official.closeTime : null;
  if (!ticker || !closeTimeUtc) {
    return null;
  }
  const expirationValue = typeof official.expirationValue === "string" && official.expirationValue.trim() !== ""
    ? official.expirationValue
    : null;
  return {
    ticker,
    closeTimeUtc,
    expirationValue,
    provenance: {
      sourceId: "v0-official-rest-metadata",
      closeTimeField: "targets[].official.closeTime",
      expirationValueField: expirationValue == null ? null : "targets[].official.expirationValue",
      retrievedVia: "v0 REST GET /markets/{ticker} (pass 2)",
    },
  };
}

export function loadOfficialMetadataForSelectedTarget(input: {
  repoRoot: string;
  selectedTicker?: string;
  readFile?: (path: string) => string | null;
  injected?: OfficialTargetMetadata | null;
}): OfficialTargetBindResult {
  const selectedTicker = input.selectedTicker ?? SELECTED_FOLLOW_UP_TICKER;
  if (input.injected) {
    return validateOfficialTargetMetadata({ metadata: input.injected, expectedTicker: selectedTicker });
  }
  const summaryPath = join(input.repoRoot, V0_OFFICIAL_METADATA_SUMMARY_RELATIVE_PATH);
  const raw = input.readFile?.(summaryPath) ?? null;
  if (raw == null) {
    return {
      status: "missing",
      reason: `permitted official metadata file is absent: ${V0_OFFICIAL_METADATA_SUMMARY_RELATIVE_PATH}`,
      metadata: null,
      request: null,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new KalshiBrtiAccessProbeError("official-metadata-corrupt");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.targets)) {
    return {
      status: "missing",
      reason: "v0 summary has no official target records",
      metadata: null,
      request: null,
    };
  }
  const match = parsed.targets.find((item): item is Record<string, unknown> => {
    return isRecord(item) && isRecord(item.official) && item.official.ticker === selectedTicker;
  });
  if (!match) {
    return {
      status: "missing",
      reason: `v0 official metadata does not include ${selectedTicker}`,
      metadata: null,
      request: null,
    };
  }
  const metadata = officialFromV0Target(match);
  if (!metadata) {
    return {
      status: "missing",
      reason: `v0 official metadata for ${selectedTicker} is missing close_time`,
      metadata: null,
      request: null,
    };
  }
  return validateOfficialTargetMetadata({ metadata, expectedTicker: selectedTicker });
}
