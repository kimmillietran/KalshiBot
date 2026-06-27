/** Partial user-supplied trading settings for normalization. */
export type TradingSettingsInput = {
  bankrollDollars?: number | null;
  minEdgePercent?: number | null;
  maxSpreadPercent?: number | null;
  kellyFraction?: number | null;
  maxPositionFraction?: number | null;
};

/** Validated trading settings for engine and dashboard consumers. */
export type ResolvedTradingSettings = {
  bankrollDollars: number | null;
  minEdgePercent: number;
  maxSpreadPercent: number;
  kellyFraction: number;
  maxPositionFraction: number;
  valid: boolean;
  warnings: readonly string[];
  modelVersion: string;
};
