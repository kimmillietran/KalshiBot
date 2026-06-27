import type { TradingSettingsFieldKey } from "../types/tradingSettingsForm";

/** Filters resolver warnings for a single settings field (presentation only). */
export function settingsFieldWarnings(
  warnings: readonly string[],
  field: TradingSettingsFieldKey,
): readonly string[] {
  return warnings.filter((warning) => warning.includes(field));
}
