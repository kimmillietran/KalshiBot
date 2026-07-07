export const DERIVED_EXPIRATION_VALUE_DERIVATION_RULE_VERSION =
  "m9.38-coinbase-1m-close-at-close-time-v1";

export const DERIVED_EXPIRATION_VALUE_SOURCE = "coinbase-spot" as const;
export const DERIVED_EXPIRATION_VALUE_INTERVAL = "1m" as const;

export type DerivedExpirationValueProvenance = {
  source: typeof DERIVED_EXPIRATION_VALUE_SOURCE;
  interval: typeof DERIVED_EXPIRATION_VALUE_INTERVAL;
  derivedAt: string;
  sourceTimestamp: string;
  derivationRuleVersion: typeof DERIVED_EXPIRATION_VALUE_DERIVATION_RULE_VERSION;
  expirationValue: string;
};

export type CoinbaseCloseAtCloseTimeResult = {
  closeUsd: number;
  sourceTimestamp: string;
};

export type FetchCoinbaseCloseUsdAtCloseTime = (
  closeTime: string,
) => Promise<CoinbaseCloseAtCloseTimeResult | null>;
