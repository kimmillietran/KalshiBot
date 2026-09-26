/**
 * Versioned Kalshi KXBTC15M contract window derivation.
 *
 * CryptoStruct day-file headers sometimes omit `instrument.expiry` (null) on
 * earlier M16-ER days. Close is recovered from the ticker HHMM in
 * America/New_York — the same validated rule as settlementFrictionCoverage /
 * m17RetainedInputRecoveryAudit — and cross-checked against header expiry
 * whenever the header provides one.
 *
 * Quote-cache identity deliberately excludes this version so expiry repair
 * does not invalidate already-persisted sparse JSONL.
 */

import { parseCloseTimeMsFromTicker } from "@/lib/data/research/m17RetainedInputRecoveryAudit/offlineDerivers";

import type { SelectedContract } from "./types";

/** Bump when contract start/expiry derivation rules change. */
export const CONTRACT_METADATA_VERSION =
  "ticker-hhmm-america-new-york-close-v1" as const;

export const CONTRACT_CLOSE_TIMEZONE = "America/New_York" as const;

export type ContractWindowSource =
  | "header-start+header-expiry"
  | "header-start+ticker-hhmm-ny-close"
  | "rejected-header-expiry-ticker-mismatch"
  | "rejected-missing-start"
  | "rejected-missing-expiry-and-ticker-unparseable"
  | "rejected-ticker-expiry-unparseable";

export type ContractWindowResolution =
  | {
      ok: true;
      contract: SelectedContract;
      source: Extract<
        ContractWindowSource,
        "header-start+header-expiry" | "header-start+ticker-hhmm-ny-close"
      >;
      headerExpiryMs: number | null;
      tickerDerivedExpiryMs: number | null;
    }
  | {
      ok: false;
      source: Exclude<
        ContractWindowSource,
        "header-start+header-expiry" | "header-start+ticker-hhmm-ny-close"
      >;
      reason: string;
      headerExpiryMs: number | null;
      tickerDerivedExpiryMs: number | null;
    };

export function parseIsoToMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Resolve [startMs, expiryMs) for a KXBTC15M member.
 * Never silently guesses: missing start, unparseable ticker close, or
 * header↔ticker conflict → explicit rejection.
 */
export function resolveContractWindow(input: {
  ticker: string;
  headerStart: string | null | undefined;
  headerExpiry: string | null | undefined;
}): ContractWindowResolution {
  const startMs = parseIsoToMs(input.headerStart ?? undefined);
  const headerExpiryMs = parseIsoToMs(input.headerExpiry ?? undefined);
  const tickerDerivedExpiryMs = parseCloseTimeMsFromTicker(
    input.ticker,
    CONTRACT_CLOSE_TIMEZONE,
  );

  if (startMs === null) {
    return {
      ok: false,
      source: "rejected-missing-start",
      reason: `missing instrument.start for ${input.ticker}`,
      headerExpiryMs,
      tickerDerivedExpiryMs,
    };
  }

  if (headerExpiryMs !== null) {
    if (tickerDerivedExpiryMs === null) {
      return {
        ok: false,
        source: "rejected-ticker-expiry-unparseable",
        reason:
          `header expiry present but ticker HHMM close unparseable for ${input.ticker}`,
        headerExpiryMs,
        tickerDerivedExpiryMs,
      };
    }
    if (tickerDerivedExpiryMs !== headerExpiryMs) {
      return {
        ok: false,
        source: "rejected-header-expiry-ticker-mismatch",
        reason:
          `ticker-derived expiry ${tickerDerivedExpiryMs} !== header expiry `
          + `${headerExpiryMs} for ${input.ticker}`,
        headerExpiryMs,
        tickerDerivedExpiryMs,
      };
    }
    return {
      ok: true,
      contract: { ticker: input.ticker, startMs, expiryMs: headerExpiryMs },
      source: "header-start+header-expiry",
      headerExpiryMs,
      tickerDerivedExpiryMs,
    };
  }

  if (tickerDerivedExpiryMs === null) {
    return {
      ok: false,
      source: "rejected-missing-expiry-and-ticker-unparseable",
      reason:
        `instrument.expiry null and ticker HHMM close unparseable for ${input.ticker}`,
      headerExpiryMs,
      tickerDerivedExpiryMs,
    };
  }

  return {
    ok: true,
    contract: {
      ticker: input.ticker,
      startMs,
      expiryMs: tickerDerivedExpiryMs,
    },
    source: "header-start+ticker-hhmm-ny-close",
    headerExpiryMs,
    tickerDerivedExpiryMs,
  };
}

export type ContractSidecarV1 = {
  zipSha256: string;
  contractMetadataVersion: typeof CONTRACT_METADATA_VERSION;
  contracts: SelectedContract[];
  keys: Record<string, { key: string; quoteCount: number }>;
  derivationStats: {
    headerExpiryUsed: number;
    tickerCloseUsed: number;
    rejected: number;
    rejectReasons: Record<string, number>;
  };
};

export function isCurrentContractSidecar(
  value: unknown,
): value is ContractSidecarV1 {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    v.contractMetadataVersion !== CONTRACT_METADATA_VERSION
    || typeof v.zipSha256 !== "string"
    || !Array.isArray(v.contracts)
    || v.keys == null
    || typeof v.keys !== "object"
  ) {
    return false;
  }
  const stats = v.derivationStats;
  if (!stats || typeof stats !== "object") return false;
  const s = stats as Record<string, unknown>;
  return (
    typeof s.headerExpiryUsed === "number"
    && typeof s.tickerCloseUsed === "number"
    && typeof s.rejected === "number"
    && s.rejectReasons != null
    && typeof s.rejectReasons === "object"
  );
}
