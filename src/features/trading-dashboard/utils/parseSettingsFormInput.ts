import type { TradingSettingsInput } from "@/lib/trading/settings";

import type { TradingSettingsFormState } from "../types/tradingSettingsForm";

/** Converts raw string form values into resolver input (type coercion only). */
function parseFormField(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function parseSettingsFormInput(
  form: TradingSettingsFormState,
): TradingSettingsInput {
  return {
    bankrollDollars: parseFormField(form.bankrollDollars),
    minEdgePercent: parseFormField(form.minEdgePercent),
    maxSpreadPercent: parseFormField(form.maxSpreadPercent),
    kellyFraction: parseFormField(form.kellyFraction),
    maxPositionFraction: parseFormField(form.maxPositionFraction),
  };
}
