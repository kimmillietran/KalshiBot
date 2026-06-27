export type TradingSettingsFieldKey =
  | "bankrollDollars"
  | "minEdgePercent"
  | "maxSpreadPercent"
  | "kellyFraction"
  | "maxPositionFraction";

export type TradingSettingsFormState = Record<TradingSettingsFieldKey, string>;

export const EMPTY_TRADING_SETTINGS_FORM: TradingSettingsFormState = {
  bankrollDollars: "",
  minEdgePercent: "",
  maxSpreadPercent: "",
  kellyFraction: "",
  maxPositionFraction: "",
};
