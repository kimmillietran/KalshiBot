import { resolveTradingSettings } from "@/lib/trading/settings";
import type { ResolvedTradingSettings, TradingSettingsInput } from "@/lib/trading/settings";

import {
  EMPTY_TRADING_SETTINGS_FORM,
  type TradingSettingsFormState,
} from "../types/tradingSettingsForm";
import { parseSettingsFormInput } from "../utils/parseSettingsFormInput";

export function resolvedSettingsFromInput(
  input: TradingSettingsInput = {},
): ResolvedTradingSettings {
  return resolveTradingSettings(input);
}

export function resolvedSettingsFromForm(
  form: Partial<TradingSettingsFormState> = {},
): ResolvedTradingSettings {
  return resolveTradingSettings(
    parseSettingsFormInput({ ...EMPTY_TRADING_SETTINGS_FORM, ...form }),
  );
}

export { EMPTY_TRADING_SETTINGS_FORM };
