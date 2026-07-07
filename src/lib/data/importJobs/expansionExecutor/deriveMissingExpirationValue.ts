import type { KalshiMarketWireShape } from "@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics";
import {
  DERIVED_EXPIRATION_VALUE_DERIVATION_RULE_VERSION,
  DERIVED_EXPIRATION_VALUE_INTERVAL,
  DERIVED_EXPIRATION_VALUE_SOURCE,
  type DerivedExpirationValueProvenance,
  type FetchCoinbaseCloseUsdAtCloseTime,
} from "@/lib/data/importers/kalshi/kalshiDerivedExpirationValueTypes";

import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";

export {
  DERIVED_EXPIRATION_VALUE_DERIVATION_RULE_VERSION,
  DERIVED_EXPIRATION_VALUE_INTERVAL,
  DERIVED_EXPIRATION_VALUE_SOURCE,
} from "@/lib/data/importers/kalshi/kalshiDerivedExpirationValueTypes";
export type {
  CoinbaseCloseAtCloseTimeResult,
  DerivedExpirationValueProvenance,
  FetchCoinbaseCloseUsdAtCloseTime,
} from "@/lib/data/importers/kalshi/kalshiDerivedExpirationValueTypes";

const KXBTC15M_SERIES = "KXBTC15M";

export type DeriveMissingExpirationValueInput = {
  market: ExpansionDiscoveredMarket;
  derivedAt: string;
  fetchCoinbaseCloseUsdAtCloseTime: FetchCoinbaseCloseUsdAtCloseTime;
};

export type DeriveMissingExpirationValueSuccess = {
  ok: true;
  market: ExpansionDiscoveredMarket;
  provenance: DerivedExpirationValueProvenance;
};

export type DeriveMissingExpirationValueFailure = {
  ok: false;
  reason: string;
};

export type DeriveMissingExpirationValueResult =
  | DeriveMissingExpirationValueSuccess
  | DeriveMissingExpirationValueFailure;

/** Returns true when Kalshi provided a non-empty official expiration_value. */
export function hasOfficialKalshiExpirationValue(
  wire: KalshiMarketWireShape | null | undefined,
): boolean {
  return Boolean(wire?.expiration_value?.trim());
}

/** Returns true when only expiration_value is missing from required import fields. */
export function isOnlyMissingExpirationValue(
  missingRequiredFields: readonly string[],
): boolean {
  return (
    missingRequiredFields.length === 1
    && missingRequiredFields[0] === "expiration_value"
  );
}

function resolveSeriesTicker(wire: KalshiMarketWireShape, marketTicker: string): string {
  if (wire.series_ticker?.trim()) {
    return wire.series_ticker.trim();
  }

  return marketTicker.split("-")[0] ?? marketTicker;
}

/** Validates preconditions for Coinbase-derived expiration_value injection. */
export function isDerivedExpirationValueEligible(
  market: Pick<ExpansionDiscoveredMarket, "marketTicker" | "listMarketWire" | "openTime" | "closeTime">,
): boolean {
  const wire = market.listMarketWire;

  if (hasOfficialKalshiExpirationValue(wire)) {
    return false;
  }

  const seriesTicker = resolveSeriesTicker(wire, market.marketTicker);
  if (seriesTicker !== KXBTC15M_SERIES && !market.marketTicker.startsWith(`${KXBTC15M_SERIES}-`)) {
    return false;
  }

  if (!wire.ticker?.trim() || wire.ticker.trim() !== market.marketTicker) {
    return false;
  }

  const openTime = wire.open_time?.trim() ?? market.openTime?.trim();
  const closeTime = wire.close_time?.trim() ?? market.closeTime?.trim();
  if (!openTime || !closeTime || !Number.isFinite(Date.parse(closeTime))) {
    return false;
  }

  if (!wire.result?.trim()) {
    return false;
  }

  if (
    wire.floor_strike === null
    || wire.floor_strike === undefined
    || !Number.isFinite(wire.floor_strike)
  ) {
    return false;
  }

  return true;
}

/** Formats a Coinbase close price to match Kalshi expiration_value wire precision. */
export function formatDerivedExpirationValue(closeUsd: number): string {
  if (!Number.isFinite(closeUsd) || closeUsd <= 0) {
    throw new Error("Derived expiration value must be a positive finite number");
  }

  return closeUsd.toFixed(2);
}

function cloneMarketWithDerivedExpirationValue(
  market: ExpansionDiscoveredMarket,
  expirationValue: string,
): ExpansionDiscoveredMarket {
  const listMarketWire: KalshiMarketWireShape = {
    ...market.listMarketWire,
    expiration_value: expirationValue,
  };

  return {
    ...market,
    expirationValue,
    listMarketWire,
  };
}

/** Derives expiration_value from Coinbase 1m close at close_time when eligible. */
export async function deriveMissingExpirationValue(
  input: DeriveMissingExpirationValueInput,
): Promise<DeriveMissingExpirationValueResult> {
  if (!isDerivedExpirationValueEligible(input.market)) {
    return {
      ok: false,
      reason: "Market is not eligible for derived expiration_value",
    };
  }

  const closeTime = input.market.listMarketWire.close_time?.trim()
    ?? input.market.closeTime?.trim();
  if (!closeTime) {
    return {
      ok: false,
      reason: "Missing close_time for derived expiration_value",
    };
  }

  const coinbaseClose = await input.fetchCoinbaseCloseUsdAtCloseTime(closeTime);
  if (coinbaseClose === null) {
    return {
      ok: false,
      reason: "Coinbase 1m close unavailable at close_time",
    };
  }

  let expirationValue: string;
  try {
    expirationValue = formatDerivedExpirationValue(coinbaseClose.closeUsd);
  } catch {
    return {
      ok: false,
      reason: "Derived expiration_value is not finite and positive",
    };
  }

  const provenance: DerivedExpirationValueProvenance = {
    source: DERIVED_EXPIRATION_VALUE_SOURCE,
    interval: DERIVED_EXPIRATION_VALUE_INTERVAL,
    derivedAt: input.derivedAt,
    sourceTimestamp: coinbaseClose.sourceTimestamp,
    derivationRuleVersion: DERIVED_EXPIRATION_VALUE_DERIVATION_RULE_VERSION,
    expirationValue,
  };

  return {
    ok: true,
    market: cloneMarketWithDerivedExpirationValue(input.market, expirationValue),
    provenance,
  };
}
